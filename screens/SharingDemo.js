import React, { useEffect, useState } from 'react'
import { View, Text, TextInput, Button, FlatList, StyleSheet } from 'react-native'
import {
  ensureUserBootstrap,
  searchUserByEmail,
  createConnection,
  respondToConnectionById,
  subscribeIncoming,
  subscribeOutgoing,
} from "../services/sharing";
import { auth } from '../services/firestore'
import { onAuthStateChanged } from '@react-native-firebase/auth'
import SharedTextDoc from "../components/SharedTextDoc";
import SharedDocsList from "./SharedDocsList";

export default function SharingDemo() {
  const [email, setEmail] = useState('')
  const [found, setFound] = useState(null)
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [errText, setErrText] = useState('')
  const [infoText, setInfoText] = useState('')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setErrText('Sign in first to test the demo'); return }
      setErrText('')
      try { await ensureUserBootstrap(); setInfoText('Index is in sync.'); } catch (e) { setErrText(String(e.message || e)) }
    })
    return unsub
  }, [])

  useEffect(() => {
    let u1, u2
    try {
      u1 = subscribeIncoming(setIncoming, e => setErrText(e.message))
      u2 = subscribeOutgoing(setOutgoing, e => setErrText(e.message))
    } catch (e) {
      setErrText(String(e.message || e))
    }
    return () => { u1 && u1(); u2 && u2() }
  }, [])

  async function doSearch() {
    try {
      setErrText(''); setInfoText('')
      const res = await searchUserByEmail(email);
      setFound(res)
      if (!res) setErrText('User not found in emailIndex')
    } catch (e) { setErrText(String(e.message || e)) }
  }

  async function doConnect() {
    try {
      setErrText(''); setInfoText('')
      if (found?.uid) { await createConnection(found.uid); setInfoText('Request created') }
    } catch (e) { setErrText(String(e.message || e)) }
  }

  return (
    <View style={styles.container}>
      {!!errText && <Text style={{ color: "red" }}>{errText}</Text>}
      {!!infoText && <Text style={{ color: "green" }}>{infoText}</Text>}

      <Text style={styles.title}>Sharing Demo</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <Button title="Search" onPress={doSearch} />
      </View>
      {found && (
        <View style={{ marginBottom: 16 }}>
          <Text>
            Found: {found.displayName || found.emailLower || found.uid}
          </Text>
          <Button title="Connect" onPress={doConnect} />
        </View>
      )}

      <Text style={styles.subtitle}>Incoming</Text>
      <FlatList
        data={incoming}
        keyExtractor={(i) => i.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={styles.rowBetween}>
            <Text>
              {item.fromEmailLower} ➜ you · {item.status}
            </Text>
            {item.status === "pending" && (
              <View style={styles.row}>
                <Button
                  title="Accept"
                  onPress={() =>
                    respondToConnectionById(item.fromUid, "accept")
                  }
                />
                <View style={{ width: 8 }} />
                <Button
                  title="Decline"
                  onPress={() =>
                    respondToConnectionById(item.fromUid, "decline")
                  }
                />
              </View>
            )}
          </View>
        )}
      />

      <Text style={styles.subtitle}>Outgoing</Text>
      <FlatList
        data={outgoing}
        keyExtractor={(i) => i.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Text>
            you ➜ {item.toEmailLower} · {item.status}
          </Text>
        )}
      />
      <SharedDocsList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  subtitle: { fontSize: 16, fontWeight: '600', marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginRight: 8 },
})
