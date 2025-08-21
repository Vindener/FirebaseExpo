import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { subscribeMyPersonalDocs } from '../services/pdocs'
import NewPersonalDocButton from '../components/NewPersonalDocButton'
import PersonalDocEditor from '../components/PersonalDocEditor'

export default function PersonalDocsList() {
  const [docs, setDocs] = useState([])
  const [err, setErr] = useState('')

  useEffect(()=>{
    let u
    try { u = subscribeMyPersonalDocs(setDocs, e => setErr(e.message || String(e))) }
    catch(e){ setErr(e.message || String(e)) }
    return () => { u && u() }
  }, [])

  return (
    <View style={styles.container}>
      {!!err && <Text style={{color:'red'}}>{err}</Text>}
      <Text style={styles.title}>My Personal Docs</Text>
      <NewPersonalDocButton onCreated={()=>{}} />
      <FlatList
        data={docs}
        keyExtractor={i=>i.id}
        ItemSeparatorComponent={()=><View style={{height:12}}/>}
        renderItem={({item}) => (
          <View>
            <Text style={styles.itemTitle}>{item.id}</Text>
            <PersonalDocEditor docId={item.id} />
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex:1, paddingTop: 60, paddingHorizontal:16, backgroundColor:'#fff' },
  title: { fontSize:18, fontWeight:'700', marginBottom:12 },
  itemTitle: { fontSize:14, fontWeight:'600', marginBottom:4 }
})
