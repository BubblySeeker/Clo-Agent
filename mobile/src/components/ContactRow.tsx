import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { Contact } from "../lib/api/contacts";

interface ContactRowProps {
  contact: Contact;
  onPress: () => void;
}

export function ContactRow({ contact, onPress }: ContactRowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.info}>
        <Text style={styles.name}>
          {contact.first_name} {contact.last_name}
        </Text>
        {contact.phone && (
          <Text style={styles.phone}>{contact.phone}</Text>
        )}
      </View>
      <Text style={styles.chevron}>{">"}</Text>
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
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
  },
  phone: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  chevron: {
    fontSize: 18,
    color: "#9ca3af",
  },
});
