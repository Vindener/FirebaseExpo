import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, Button, StyleSheet, Alert } from 'react-native'
import { subscribeIncomingDocShares, subscribeOutgoingDocShares, respondDocShareById, claimDocShare } from '../services/pdocs'

export default function DocShareRequests() {
  const [incoming, setIncoming] = useState([])
  const [outgoing, setOutgoing] = useState([])
  const [err, setErr] = useState('')

  useEffect(()=>{
    let u1,u2
    try {
      u1 = subscribeIncomingDocShares(setIncoming, e => setErr(e.message||String(e)))
      u2 = subscribeOutgoingDocShares(setOutgoing, e => setErr(e.message||String(e)))
    } catch(e){ setErr(e.message||String(e)) }
    return () => { u1 && u1(); u2 && u2() }
  }, [])

  async function onAccept(item){
    try{
      await respondDocShareById(item.id, 'accept')
      await claimDocShare(item.id)
      Alert.alert('Done', 'Access granted. Check your My Docs list.')
    }catch(e){
      Alert.alert('Accept error', e.message || String(e))
    }
  }
  async function onDecline(item){
    try{ await respondDocShareById(item.id, 'decline') }
    catch(e){ Alert.alert('Decline error', e.message || String(e)) }
  }
  async function onCancel(item){
    try{ await respondDocShareById(item.id, 'cancel') }
    catch(e){ Alert.alert('Cancel error', e.message || String(e)) }
  }
  async function onRetryClaim(item) {
    try {
      await claimDocShare(item.id);
      Alert.alert("OK", "Claimed access again");
    } catch (e) {
      if (e?.code === "not-found" && /document/i.test(e.message || "")) {
        Alert.alert(
          "Document missing",
          "Owner removed the document or it is no longer available."
        );
      } else {
        Alert.alert("Claim error", e.message || String(e));
      }
    }
  }


  const renderIncoming = ({item}) => (
    <View style={styles.rowBetween}>
      <Text>{item.fromUid} → you · {item.docId} · {item.status}</Text>
      {item.status === 'pending' ? (
        <View style={styles.row}>
          <Button title="Accept" onPress={()=>onAccept(item)} />
          <View style={{width:8}}/>
          <Button title="Decline" onPress={()=>onDecline(item)} />
        </View>
      ) : item.status === 'accepted' ? (
        <Button title="Retry claim" onPress={()=>onRetryClaim(item)} />
      ) : (
        <Text>—</Text>
      )}
    </View>
  )

  const renderOutgoing = ({item}) => (
    <View style={styles.rowBetween}>
      <Text>you → {item.toUid} · {item.docId} · {item.status}</Text>
      {item.status === 'pending' ? (
        <Button title="Cancel" onPress={()=>onCancel(item)} />
      ) : <Text>—</Text>}
    </View>
  )

  return (
    <View style={styles.container}>
      {!!err && <Text style={{color:'red'}}>{err}</Text>}
      <Text style={styles.title}>Incoming doc shares</Text>
      <FlatList
        data={incoming}
        keyExtractor={i=>i.id}
        ItemSeparatorComponent={()=><View style={{height:10}}/>}
        renderItem={renderIncoming}
      />

      <Text style={styles.title}>Outgoing doc shares</Text>
      <FlatList
        data={outgoing}
        keyExtractor={i=>i.id}
        ItemSeparatorComponent={()=><View style={{height:10}}/>}
        renderItem={renderOutgoing}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex:1, paddingTop: 60, paddingHorizontal: 16, backgroundColor:'#fff' },
  row: { flexDirection:'row', alignItems:'center' },
  rowBetween: { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  title: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
})
