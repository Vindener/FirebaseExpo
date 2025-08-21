import React, { useState } from 'react'
import { Button, View, Text } from 'react-native'
import { createPersonalDoc } from '../services/pdocs'

export default function NewPersonalDocButton({ onCreated }) {
  const [busy, setBusy] = useState(false)
  const [lastId, setLastId] = useState(null)

  async function createOne() {
    try {
      setBusy(true)
      const id = await createPersonalDoc()
      setLastId(id)
      onCreated && onCreated(id)
    } catch (e) {
      alert(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ marginVertical: 8 }}>
      <Button title={busy ? 'Creating...' : 'New document'} onPress={createOne} disabled={busy} />
      {lastId && <Text style={{ color:'#555', marginTop:6 }}>Created: {lastId}</Text>}
    </View>
  )
}
