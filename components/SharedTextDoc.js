import React, { useEffect, useState, useRef } from 'react'
import { View, Text, TextInput, Button } from 'react-native'
import { subscribeSharedText, updateSharedText, ensureSharedDoc } from '../services/sharing'

export default function SharedTextDoc({ connectionId }) {
  const [doc, setDoc] = useState(null)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const lastServer = useRef('')

  useEffect(() => {
    const unsub = subscribeSharedText(connectionId, (d) => {
      setDoc(d)
      const incoming = (d?.text ?? '')
      lastServer.current = incoming
      setText(incoming)
    })
    return unsub
  }, [connectionId])

  async function create() {
    try {
      setCreating(true)
      await ensureSharedDoc(connectionId) // will auto fetch participants from /connections/{id}
    } finally {
      setCreating(false)
    }
  }

  async function save() {
    if (!doc) return
    try {
      setSaving(true)
      await updateSharedText(connectionId, text)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{ padding: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 8 }}>
      <Text style={{ fontWeight: '600', marginBottom: 4 }}>Shared text (live)</Text>

      {!doc && (
        <View>
          <Text style={{ color:'#555', marginBottom: 6 }}>No shared doc yet for this connection.</Text>
          <Button title={creating ? 'Creating...' : 'Create shared doc'} onPress={create} disabled={creating} />
        </View>
      )}

      {!!doc && (
        <View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type here..."
            multiline
            style={{ minHeight: 80, borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8 }}
          />
          <View style={{ height: 8 }} />
          <Button title={saving ? 'Saving...' : 'Save'} onPress={save} disabled={saving} />
          <Text style={{ color: '#666', marginTop: 6 }}>v{doc.version ?? 0} · last by {doc.lastEditedBy ?? '—'}</Text>
        </View>
      )}
    </View>
  )
}
