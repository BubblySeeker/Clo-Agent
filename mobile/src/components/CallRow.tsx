import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { CallLog } from "../lib/api/calls";

interface CallRowProps {
  call: CallLog;
  onPress: () => void;
}

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

const statusColors: Record<string, string> = {
  completed: "#22c55e",
  "no-answer": "#eab308",
  busy: "#eab308",
  failed: "#ef4444",
};

export function CallRow({ call, onPress }: CallRowProps) {
  const isOutbound = call.direction === "outbound";
  const displayName = call.contact_name
    ? call.contact_name
    : isOutbound
      ? call.to_number
      : call.from_number;
  const directionColor = isOutbound ? "#3b82f6" : "#8b5cf6";
  const statusColor = statusColors[call.status] ?? "#6b7280";

  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.main}>
        <Text style={styles.name}>{displayName}</Text>
        <View style={styles.meta}>
          <Text style={[styles.direction, { color: directionColor }]}>
            {isOutbound ? "Outbound" : "Inbound"}
          </Text>
          <Text style={[styles.status, { color: statusColor }]}>
            {call.status}
          </Text>
          <Text style={styles.duration}>{formatDuration(call.duration)}</Text>
        </View>
      </View>
      <Text style={styles.time}>{timeAgo(call.started_at)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  main: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 8,
  },
  direction: {
    fontSize: 13,
    fontWeight: "500",
  },
  status: {
    fontSize: 13,
  },
  duration: {
    fontSize: 13,
    color: "#6b7280",
  },
  time: {
    fontSize: 13,
    color: "#9ca3af",
  },
});
