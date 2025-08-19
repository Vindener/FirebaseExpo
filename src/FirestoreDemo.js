import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet } from 'react-native';
import { subscribeDemo, addDemo, addUsers } from "./services/firestore";

export default function FirestoreDemo() {
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const unsub = subscribeDemo(setItems);
    return () => unsub && unsub();
  }, []);

  const onAdd = async () => {
    await addDemo(text);
    setText('');
  };

  const onAdd2 = async () => {
    await addUsers(text);
    setText("");
  };


  return (
    <View style={styles.container}>
      <Text style={styles.title}>Firestore Live Demo</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Type message"
          value={text}
          onChangeText={setText}
        />
        <Button title="Add" onPress={onAdd} />
        <Button title="Add2" onPress={onAdd2} />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Text style={styles.item}>• {item.text ?? JSON.stringify(item)}</Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  item: { fontSize: 16 },
});
