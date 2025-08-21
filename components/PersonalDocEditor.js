import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import {
  subscribePersonalDoc,
  updatePersonalDoc,
  createDocShareRequest,
  readUsersByUids,
  deletePersonalDoc,
} from "../services/pdocs";
import { getAuth } from "@react-native-firebase/auth";
import { getApp } from "@react-native-firebase/app";

const AUTOSAVE_MS = 10_000;

export default function PersonalDocEditor({ docId }) {
  const [doc, setDoc] = useState(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false); // ручний сейв
  const [autoSaving, setAutoSaving] = useState(false); // автосейв
  const [ownersProfiles, setOwnersProfiles] = useState([]);

  const me = getAuth(getApp()).currentUser?.uid;
  const isOwner = !!(doc?.owners || []).includes(me);

  const lastServerTextRef = useRef(""); 
  const lastSavedTextRef = useRef(""); 
  const dirtyRef = useRef(false); 
  const timerRef = useRef(null);

  useEffect(() => {
    const u = subscribePersonalDoc(
      docId,
      async (d) => {
        setDoc(d);
        const serverText = d?.text || "";
        lastServerTextRef.current = serverText;

        if (!dirtyRef.current) {
          setText(serverText);
        }
        // Uploading owner profiles for display
        if (d?.owners?.length) {
          try {
            setOwnersProfiles(await readUsersByUids(d.owners));
          } catch {
            setOwnersProfiles([]);
          }
        } else {
          setOwnersProfiles([]);
        }
      },
      (e) => Alert.alert("Load error", e.message || String(e))
    );
    return u;
  }, [docId]);

  // Autosave timer
  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      // Auto-save conditions: there are local changes and no other save is possible.
      if (!dirtyRef.current) return;
      if (saving || autoSaving) return;

      // save only if the text is actually different from the last saved version
      if (text === lastSavedTextRef.current) return;

      try {
        setAutoSaving(true);
        await updatePersonalDoc(docId, text);
        lastSavedTextRef.current = text;
        dirtyRef.current = false;
      } catch (e) {
        // If you're right, we'll show you once, but we won't spam you.
        console.warn("AutoSave error:", e?.code, e?.message);
      } finally {
        setAutoSaving(false);
      }
    }, AUTOSAVE_MS);

    return () => clearInterval(timerRef.current);
  }, [docId, text, saving, autoSaving]);

  function onChange(val) {
    setText(val);
    // mark local changes: we no longer force sync with the server until we save
    dirtyRef.current = val !== lastServerTextRef.current;
  }

  async function onSave() {
    try {
      setSaving(true);
      await updatePersonalDoc(docId, text);
      lastSavedTextRef.current = text;
      dirtyRef.current = false;
    } catch (e) {
      Alert.alert("Save error", e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onShare() {
    try {
      await createDocShareRequest(docId, email);
      Alert.alert("Sent", "Share request sent to user");
      setEmail("");
    } catch (e) {
      Alert.alert("Share error", e.message || String(e));
    }
  }

  async function onDelete() {
    Alert.alert("Delete document?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePersonalDoc(docId);
            Alert.alert("Deleted", "The document was removed");
          } catch (e) {
            Alert.alert("Delete error", e.message || String(e));
          }
        },
      },
    ]);
  }

  if (!doc) return <Text>Loading...</Text>;

  return (
    <View
      style={{
        padding: 8,
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        marginTop: 8,
      }}
    >
      <Text style={{ fontWeight: "600", marginBottom: 4 }}>
        Personal doc: {docId}
      </Text>

      <View style={{ marginBottom: 8 }}>
        <Text style={{ color: "#666" }}>Owner(s):</Text>
        {(ownersProfiles.length ? ownersProfiles : doc.owners || []).map(
          (o, idx) => {
            const uid = typeof o === "string" ? o : o.uid;
            const prof = ownersProfiles.find((p) => p.uid === uid);
            const name = prof?.displayName || prof?.emailLower || uid;
            const isMe = uid === me;
            return (
              <Text key={uid || idx} style={{ color: "#333" }}>
                • {name}
                {isMe ? " (you)" : ""}
              </Text>
            );
          }
        )}
      </View>

      <TextInput
        value={text}
        onChangeText={onChange}
        placeholder="Type here..."
        multiline
        style={{
          minHeight: 80,
          borderWidth: 1,
          borderColor: "#ccc",
          borderRadius: 6,
          padding: 8,
        }}
      />

      <View style={{ height: 8 }} />
      <Button
        title={saving ? "Saving..." : autoSaving ? "Autosaving…" : "Save"}
        onPress={onSave}
        disabled={saving}
      />
  
      {isOwner && (
        <>
          <View style={{ height: 8 }} />
          <Button title="Delete" color="#c62828" onPress={onDelete} />
          <View style={{ height: 12 }} />
          <Text style={{ fontWeight: "600" }}>Share (request)</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6,
              padding: 8,
              marginTop: 6,
            }}
          />
          <View style={{ height: 8 }} />
          <Button
            title="Send request"
            onPress={onShare}
            disabled={!email.trim()}
          />
        </>
      )}
    </View>
  );
}
