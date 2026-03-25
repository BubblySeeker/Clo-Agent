package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"crm-api/internal/config"
	"crm-api/internal/database"
	"crm-api/internal/middleware"
)

// Document represents a document record without the raw file bytes.
type Document struct {
	ID           string    `json:"id"`
	AgentID      string    `json:"agent_id"`
	ContactID    *string   `json:"contact_id"`
	ContactName  *string   `json:"contact_name"`
	PropertyID   *string   `json:"property_id"`
	PropertyName *string   `json:"property_name"`
	FolderID     *string   `json:"folder_id"`
	FolderName   *string   `json:"folder_name"`
	Filename     string    `json:"filename"`
	FileType     string    `json:"file_type"`
	FileSize     int64     `json:"file_size"`
	Status       string    `json:"status"`
	ErrorMessage *string   `json:"error_message"`
	PageCount    *int      `json:"page_count"`
	ChunkCount   int       `json:"chunk_count"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// DocumentChunk represents a single chunk of a processed document.
type DocumentChunk struct {
	ID             string          `json:"id"`
	DocumentID     string          `json:"document_id"`
	ChunkIndex     int             `json:"chunk_index"`
	Content        string          `json:"content"`
	PageNumber     *int            `json:"page_number"`
	SectionHeading *string         `json:"section_heading"`
	Metadata       json.RawMessage `json:"metadata"`
	CreatedAt      time.Time       `json:"created_at"`
}

// allowedExtensions is the whitelist of accepted file extensions for upload.
var allowedExtensions = map[string]bool{
	".pdf":  true,
	".docx": true,
	".doc":  true,
	".csv":  true,
	".txt":  true,
	".xlsx": true,
	".xls":  true,
	".rtf":  true,
	".md":   true,
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".webp": true,
}

// contentTypeMap maps file extensions to MIME types for the download endpoint.
var contentTypeMap = map[string]string{
	".pdf":  "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".doc":  "application/msword",
	".csv":  "text/csv",
	".txt":  "text/plain",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".xls":  "application/vnd.ms-excel",
	".rtf":  "application/rtf",
	".md":   "text/markdown",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
}

// UploadDocument handles multipart file upload, stores the document, and fires
// off async processing via the AI service.
func UploadDocument(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		// Limit request body to 100 MB.
		r.Body = http.MaxBytesReader(w, r.Body, 100<<20)
		if err := r.ParseMultipartForm(100 << 20); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "file too large or invalid multipart form", ErrCodeBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "file is required", ErrCodeBadRequest)
			return
		}
		defer file.Close()

		// Validate file extension.
		ext := strings.ToLower(filepath.Ext(header.Filename))
		if !allowedExtensions[ext] {
			respondErrorWithCode(w, http.StatusBadRequest, "unsupported file type: "+ext, ErrCodeBadRequest)
			return
		}

		// Optional contact_id.
		var contactID *string
		if cid := r.FormValue("contact_id"); cid != "" {
			contactID = &cid
		}

		// Optional folder_id.
		var folderID *string
		if fid := r.FormValue("folder_id"); fid != "" {
			folderID = &fid
		}

		// Optional property_id.
		var propertyID *string
		if pid := r.FormValue("property_id"); pid != "" {
			propertyID = &pid
		}

		// Read file bytes.
		fileBytes, err := io.ReadAll(file)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "failed to read file", ErrCodeDatabase)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var doc Document
		err = tx.QueryRow(r.Context(),
			`INSERT INTO documents (agent_id, contact_id, property_id, folder_id, filename, file_type, file_size, raw_file, status)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing')
			 RETURNING id, agent_id, contact_id, property_id, folder_id, filename, file_type, file_size, status, error_message, page_count, chunk_count, created_at, updated_at`,
			agentID, contactID, propertyID, folderID, header.Filename, ext, len(fileBytes), fileBytes,
		).Scan(&doc.ID, &doc.AgentID, &doc.ContactID, &doc.PropertyID, &doc.FolderID, &doc.Filename, &doc.FileType, &doc.FileSize,
			&doc.Status, &doc.ErrorMessage, &doc.PageCount, &doc.ChunkCount, &doc.CreatedAt, &doc.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "failed to store document", ErrCodeDatabase)
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "commit error", ErrCodeDatabase)
			return
		}

		// Fire async processing via AI service.
		go proxyProcessDocument(cfg, pool, doc.ID, agentID)

		respondJSON(w, http.StatusCreated, doc)
	}
}

// ListDocuments returns paginated documents for the authenticated agent.
func ListDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 25
		}
		offset := (page - 1) * limit

		status := r.URL.Query().Get("status")
		contactID := r.URL.Query().Get("contact_id")
		folderID := r.URL.Query().Get("folder_id")
		propertyID := r.URL.Query().Get("property_id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var args []interface{}
		whereExpr := "1=1"

		if status != "" {
			args = append(args, status)
			whereExpr += fmt.Sprintf(" AND d.status = $%d", len(args))
		}
		if contactID != "" {
			if contactID == "general" {
				whereExpr += " AND d.contact_id IS NULL"
			} else {
				args = append(args, contactID)
				whereExpr += fmt.Sprintf(" AND d.contact_id = $%d", len(args))
			}
		}
		if propertyID != "" {
			if propertyID == "general" {
				whereExpr += " AND d.property_id IS NULL"
			} else {
				args = append(args, propertyID)
				whereExpr += fmt.Sprintf(" AND d.property_id = $%d", len(args))
			}
		}
		if folderID != "" {
			if folderID == "general" {
				whereExpr += " AND d.folder_id IS NULL"
			} else if folderID == "unfiled" {
				whereExpr += " AND d.contact_id IS NULL AND d.property_id IS NULL"
			} else {
				args = append(args, folderID)
				whereExpr += fmt.Sprintf(" AND d.folder_id = $%d", len(args))
			}
		}

		var total int
		countSQL := "SELECT COUNT(*) FROM documents d WHERE " + whereExpr
		if err := tx.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "count error", ErrCodeDatabase)
			return
		}

		dataArgs := append(append([]interface{}{}, args...), limit, offset)
		dataSQL := fmt.Sprintf(
			`SELECT d.id, d.agent_id, d.contact_id,
			        c.first_name || ' ' || c.last_name AS contact_name,
			        d.property_id, p.address AS property_name,
			        d.folder_id, f.name AS folder_name,
			        d.filename, d.file_type, d.file_size, d.status, d.error_message,
			        d.page_count, d.chunk_count, d.created_at, d.updated_at
			 FROM documents d
			 LEFT JOIN contacts c ON c.id = d.contact_id
			 LEFT JOIN properties p ON p.id = d.property_id
			 LEFT JOIN document_folders f ON f.id = d.folder_id
			 WHERE %s ORDER BY d.created_at DESC LIMIT $%d OFFSET $%d`,
			whereExpr, len(dataArgs)-1, len(dataArgs),
		)

		rows, err := tx.Query(r.Context(), dataSQL, dataArgs...)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		documents := make([]Document, 0)
		for rows.Next() {
			var d Document
			if err := rows.Scan(&d.ID, &d.AgentID, &d.ContactID, &d.ContactName,
				&d.PropertyID, &d.PropertyName,
				&d.FolderID, &d.FolderName,
				&d.Filename, &d.FileType, &d.FileSize,
				&d.Status, &d.ErrorMessage, &d.PageCount, &d.ChunkCount, &d.CreatedAt, &d.UpdatedAt); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			documents = append(documents, d)
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "commit error", ErrCodeDatabase)
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"documents": documents,
			"total":     total,
		})
	}
}

// GetDocument returns a single document by ID (without raw file bytes).
func GetDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var d Document
		err = tx.QueryRow(r.Context(),
			`SELECT d.id, d.agent_id, d.contact_id,
			        c.first_name || ' ' || c.last_name AS contact_name,
			        d.property_id, p.address AS property_name,
			        d.folder_id, f.name AS folder_name,
			        d.filename, d.file_type, d.file_size, d.status, d.error_message,
			        d.page_count, d.chunk_count, d.created_at, d.updated_at
			 FROM documents d
			 LEFT JOIN contacts c ON c.id = d.contact_id
			 LEFT JOIN properties p ON p.id = d.property_id
			 LEFT JOIN document_folders f ON f.id = d.folder_id
			 WHERE d.id = $1`, id,
		).Scan(&d.ID, &d.AgentID, &d.ContactID, &d.ContactName,
			&d.PropertyID, &d.PropertyName,
			&d.FolderID, &d.FolderName,
			&d.Filename, &d.FileType, &d.FileSize,
			&d.Status, &d.ErrorMessage, &d.PageCount, &d.ChunkCount, &d.CreatedAt, &d.UpdatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "document not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, d)
	}
}

// DeleteDocument removes a document and its chunks (via FK CASCADE).
func DeleteDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		result, err := tx.Exec(r.Context(), `DELETE FROM documents WHERE id = $1`, id)
		if err != nil || result.RowsAffected() == 0 {
			respondErrorWithCode(w, http.StatusNotFound, "document not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}
}

// DownloadDocument streams the raw file bytes with appropriate headers.
func DownloadDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var rawFile []byte
		var filename, fileType string
		err = tx.QueryRow(r.Context(),
			`SELECT raw_file, filename, file_type FROM documents WHERE id = $1`, id,
		).Scan(&rawFile, &filename, &fileType)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "document not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())

		ct, ok := contentTypeMap[fileType]
		if !ok {
			ct = "application/octet-stream"
		}

		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Content-Length", strconv.Itoa(len(rawFile)))
		w.WriteHeader(http.StatusOK)
		w.Write(rawFile) //nolint:errcheck
	}
}

// PreviewDocument returns the PDF preview of a document.
// For native PDFs, returns raw_file. For other types, returns pdf_preview (converted during processing).
func PreviewDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var rawFile, pdfPreview []byte
		var filename, fileType string
		err = tx.QueryRow(r.Context(),
			`SELECT raw_file, pdf_preview, filename, file_type FROM documents WHERE id = $1`, id,
		).Scan(&rawFile, &pdfPreview, &filename, &fileType)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "document not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())

		// Use pdf_preview if available, otherwise raw_file (for native PDFs)
		var pdfBytes []byte
		if pdfPreview != nil && len(pdfPreview) > 0 {
			pdfBytes = pdfPreview
		} else if fileType == ".pdf" {
			pdfBytes = rawFile
		} else {
			respondErrorWithCode(w, http.StatusNotFound, "no PDF preview available", ErrCodeNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s.pdf"`, strings.TrimSuffix(filename, fileType)))
		w.Header().Set("Content-Length", strconv.Itoa(len(pdfBytes)))
		w.WriteHeader(http.StatusOK)
		w.Write(pdfBytes) //nolint:errcheck
	}
}

// GetDocumentChunks returns paginated chunks for a document.
func GetDocumentChunks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		docID := chi.URLParam(r, "id")

		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 50
		}
		offset := (page - 1) * limit

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var total int
		if err := tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM document_chunks WHERE document_id = $1`, docID,
		).Scan(&total); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "count error", ErrCodeDatabase)
			return
		}

		rows, err := tx.Query(r.Context(),
			`SELECT id, document_id, chunk_index, content, page_number, section_heading, metadata, created_at
			 FROM document_chunks WHERE document_id = $1
			 ORDER BY chunk_index ASC LIMIT $2 OFFSET $3`,
			docID, limit, offset,
		)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "query error", ErrCodeDatabase)
			return
		}
		defer rows.Close()

		chunks := make([]DocumentChunk, 0)
		for rows.Next() {
			var c DocumentChunk
			if err := rows.Scan(&c.ID, &c.DocumentID, &c.ChunkIndex, &c.Content,
				&c.PageNumber, &c.SectionHeading, &c.Metadata, &c.CreatedAt); err != nil {
				respondErrorWithCode(w, http.StatusInternalServerError, "scan error", ErrCodeDatabase)
				return
			}
			chunks = append(chunks, c)
		}

		if err := tx.Commit(r.Context()); err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "commit error", ErrCodeDatabase)
			return
		}

		respondJSON(w, http.StatusOK, map[string]interface{}{
			"chunks": chunks,
			"total":  total,
		})
	}
}

// GetDocumentChunk returns a single chunk by ID.
func GetDocumentChunk(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		chunkID := chi.URLParam(r, "chunkId")

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		var c DocumentChunk
		err = tx.QueryRow(r.Context(),
			`SELECT id, document_id, chunk_index, content, page_number, section_heading, metadata, created_at
			 FROM document_chunks WHERE id = $1`, chunkID,
		).Scan(&c.ID, &c.DocumentID, &c.ChunkIndex, &c.Content,
			&c.PageNumber, &c.SectionHeading, &c.Metadata, &c.CreatedAt)
		if err != nil {
			respondErrorWithCode(w, http.StatusNotFound, "chunk not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, c)
	}
}

// proxyProcessDocument sends a processing request to the AI service in the background.
// On failure, it updates the document status to 'failed'.
func proxyProcessDocument(cfg *config.Config, pool *pgxpool.Pool, docID, agentID string) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("document processing goroutine panicked", "doc_id", docID, "panic", r)
			markDocumentFailed(pool, docID, agentID, fmt.Sprintf("internal error: %v", r))
		}
	}()

	payload, _ := json.Marshal(map[string]string{
		"document_id": docID,
		"agent_id":    agentID,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		cfg.AIServiceURL+"/ai/documents/process", bytes.NewBuffer(payload))
	if err != nil {
		slog.Error("document processing: failed to build request", "doc_id", docID, "error", err)
		markDocumentFailed(pool, docID, agentID, "failed to build processing request")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		slog.Error("document processing: AI service request failed", "doc_id", docID, "error", err)
		markDocumentFailed(pool, docID, agentID, "AI service unavailable: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("AI service returned %d: %s", resp.StatusCode, string(body))
		slog.Error("document processing: AI service error", "doc_id", docID, "status", resp.StatusCode)
		markDocumentFailed(pool, docID, agentID, errMsg)
	}
}

// UpdateDocument allows patching a document's contact_id, property_id, or folder_id.
func UpdateDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		id := chi.URLParam(r, "id")

		var body struct {
			ContactID  *string `json:"contact_id"`
			PropertyID *string `json:"property_id"`
			FolderID   *string `json:"folder_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			respondErrorWithCode(w, http.StatusBadRequest, "invalid JSON", ErrCodeBadRequest)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		setClauses := []string{"updated_at = NOW()"}
		args := []interface{}{}

		if body.ContactID != nil {
			args = append(args, *body.ContactID)
			if *body.ContactID == "" {
				setClauses = append(setClauses, "contact_id = NULL")
				args = args[:len(args)-1]
			} else {
				setClauses = append(setClauses, fmt.Sprintf("contact_id = $%d", len(args)))
			}
		}
		if body.PropertyID != nil {
			args = append(args, *body.PropertyID)
			if *body.PropertyID == "" {
				setClauses = append(setClauses, "property_id = NULL")
				args = args[:len(args)-1]
			} else {
				setClauses = append(setClauses, fmt.Sprintf("property_id = $%d", len(args)))
			}
		}
		if body.FolderID != nil {
			args = append(args, *body.FolderID)
			if *body.FolderID == "" {
				setClauses = append(setClauses, "folder_id = NULL")
				args = args[:len(args)-1]
			} else {
				setClauses = append(setClauses, fmt.Sprintf("folder_id = $%d", len(args)))
			}
		}

		args = append(args, id)
		sql := fmt.Sprintf("UPDATE documents SET %s WHERE id = $%d",
			strings.Join(setClauses, ", "), len(args))

		result, err := tx.Exec(r.Context(), sql, args...)
		if err != nil || result.RowsAffected() == 0 {
			respondErrorWithCode(w, http.StatusNotFound, "document not found", ErrCodeNotFound)
			return
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

// DocumentCounts returns grouped document counts for the sidebar.
func DocumentCounts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		if agentID == "" {
			respondErrorWithCode(w, http.StatusUnauthorized, "unauthorized", ErrCodeUnauthorized)
			return
		}

		tx, err := database.BeginWithRLS(r.Context(), pool, agentID)
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "database error", ErrCodeDatabase)
			return
		}
		defer tx.Rollback(r.Context())

		// General count: no contact, no property (may or may not have a folder)
		var general int
		tx.QueryRow(r.Context(),
			`SELECT COUNT(*) FROM documents WHERE contact_id IS NULL AND property_id IS NULL`,
		).Scan(&general)

		// By contact
		type contactCount struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Count int    `json:"count"`
		}
		contactRows, _ := tx.Query(r.Context(),
			`SELECT c.id, c.first_name || ' ' || c.last_name, COUNT(d.id)
			 FROM contacts c INNER JOIN documents d ON d.contact_id = c.id
			 GROUP BY c.id, c.first_name, c.last_name ORDER BY c.first_name, c.last_name`)
		defer contactRows.Close()
		byContact := make([]contactCount, 0)
		for contactRows.Next() {
			var cc contactCount
			contactRows.Scan(&cc.ID, &cc.Name, &cc.Count)
			byContact = append(byContact, cc)
		}

		// By property
		type propertyCount struct {
			ID    string `json:"id"`
			Name  string `json:"name"`
			Count int    `json:"count"`
		}
		propRows, _ := tx.Query(r.Context(),
			`SELECT p.id, p.address, COUNT(d.id)
			 FROM properties p INNER JOIN documents d ON d.property_id = p.id
			 GROUP BY p.id, p.address ORDER BY p.address`)
		defer propRows.Close()
		byProperty := make([]propertyCount, 0)
		for propRows.Next() {
			var pc propertyCount
			propRows.Scan(&pc.ID, &pc.Name, &pc.Count)
			byProperty = append(byProperty, pc)
		}

		tx.Commit(r.Context())
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"general":     general,
			"by_contact":  byContact,
			"by_property": byProperty,
		})
	}
}

// ProxyExtractProperty forwards a property extraction request to the AI service.
func ProxyExtractProperty(pool *pgxpool.Pool, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		agentID := middleware.AgentUUIDFromContext(r.Context())
		docID := chi.URLParam(r, "id")

		payload, _ := json.Marshal(map[string]string{
			"document_id": docID,
			"agent_id":    agentID,
		})

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			cfg.AIServiceURL+"/ai/documents/extract-property", bytes.NewBuffer(payload))
		if err != nil {
			respondErrorWithCode(w, http.StatusInternalServerError, "failed to build request", ErrCodeDatabase)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-AI-Service-Secret", cfg.AIServiceSecret)

		client := &http.Client{Timeout: 60 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			respondErrorWithCode(w, http.StatusBadGateway, "AI service unavailable", ErrCodeInternal)
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		w.Write(body) //nolint:errcheck
	}
}

// markDocumentFailed updates a document's status to 'failed' with an error message.
func markDocumentFailed(pool *pgxpool.Pool, docID, agentID, errMsg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tx, err := database.BeginWithRLS(ctx, pool, agentID)
	if err != nil {
		slog.Error("markDocumentFailed: failed to begin tx", "doc_id", docID, "error", err)
		return
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`UPDATE documents SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
		errMsg, docID)
	if err != nil {
		slog.Error("markDocumentFailed: failed to update", "doc_id", docID, "error", err)
		return
	}

	tx.Commit(ctx)
}
