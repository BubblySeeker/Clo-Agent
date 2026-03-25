import {
  ScrollView,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { getCallLog } from "../../lib/api/calls";
import { CallButton } from "../../components/CallButton";

const statusColors: Record<string, string> = {
  completed: "#22c55e",
  "no-answer": "#eab308",
  busy: "#eab308",
  failed: "#ef4444",
};

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDateTime(dateString: string): string {
  const d = new Date(dateString);
  return d.toLocaleString();
}

export default function CallDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();

  const { data: call, isLoading } = useQuery({
    queryKey: ["call", id],
    queryFn: async () => {
      const token = await getToken();
      return getCallLog(token!, id);
    },
    enabled: !!id,
  });

  if (isLoading || !call) {
    return (
      <>
        <Stack.Screen options={{ title: "Call Details" }} />
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </>
    );
  }

  const isOutbound = call.direction === "outbound";
  const displayName = call.contact_name
    ? call.contact_name
    : isOutbound
      ? call.to_number
      : call.from_number;
  const directionColor = isOutbound ? "#3b82f6" : "#8b5cf6";
  const statusColor = statusColors[call.status] ?? "#6b7280";
  const callPhone = isOutbound ? call.to_number : call.from_number;

  return (
    <>
      <Stack.Screen options={{ title: displayName }} />
      <ScrollView style={styles.container}>
        {/* Header */}
        <Text style={styles.name}>{displayName}</Text>
        <Text style={[styles.direction, { color: directionColor }]}>
          {isOutbound ? "Outbound Call" : "Inbound Call"}
        </Text>

        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.row}>
            <Text style={[styles.statusBadge, { color: statusColor }]}>
              {call.status}
            </Text>
            <Text style={styles.duration}>{formatDuration(call.duration)}</Text>
          </View>
        </View>

        {/* Time */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Time</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Started</Text>
            <Text style={styles.value}>{formatDateTime(call.started_at)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Ended</Text>
            <Text style={styles.value}>
              {call.ended_at ? formatDateTime(call.ended_at) : "In progress"}
            </Text>
          </View>
        </View>

        {/* AI Summary / Transcript */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI Summary</Text>
          {call.ai_summary ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryText}>{call.ai_summary}</Text>
            </View>
          ) : (
            <Text style={styles.noTranscript}>No transcript available</Text>
          )}
        </View>

        {/* Call Again */}
        {call.contact_id && (
          <View style={styles.callSection}>
            <CallButton contactId={call.contact_id} phone={callPhone} />
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 16,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  direction: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 4,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  statusBadge: {
    fontSize: 16,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  duration: {
    fontSize: 16,
    color: "#374151",
  },
  label: {
    fontSize: 14,
    color: "#6b7280",
  },
  value: {
    fontSize: 14,
    color: "#111827",
  },
  summaryCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  summaryText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  noTranscript: {
    fontSize: 14,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  callSection: {
    marginTop: 8,
    marginBottom: 32,
  },
});
