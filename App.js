import React, { useState, useEffect } from "react";
import {
  Button,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import "expo-dev-client";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithCredential,
  onAuthStateChanged,
  signOut,
} from "@react-native-firebase/auth";
import {
  GoogleSignin,
} from "@react-native-google-signin/google-signin";
import FirestoreDemo from "./src/FirestoreDemo";

export default function App() {
  // Set an initializing state whilst Firebase connects
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState();

  GoogleSignin.configure({
    webClientId:
      "113871070366-0pun8bq3fhk3i158mq2us56plhj8ntnd.apps.googleusercontent.com",
  });

  async function logout() {
    signOut(getAuth()).then(() => console.log("User signed out!"));
  }

  async function onGoogleButtonPress() {
    // Check if your device supports Google Play
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Get the users ID token
    const signInResult = await GoogleSignin.signIn();

    // Try the new style of google-sign in result, from v13+ of that module
    idToken = signInResult.data?.idToken;
    if (!idToken) {
      // if you are using older versions of google-signin, try old style result
      idToken = signInResult.idToken;
    }
    if (!idToken) {
      throw new Error("No ID token found");
    }

    // Create a Google credential with the token
    const googleCredential = GoogleAuthProvider.credential(
      signInResult.data.idToken
    );

    // Sign-in the user with the credential
    return signInWithCredential(getAuth(), googleCredential);
  }

  // Handle user state changes
  function handleAuthStateChanged(user) {
    setUser(user);
    if (initializing) setInitializing(false);
  }

  useEffect(() => {
    const subscriber = onAuthStateChanged(getAuth(), handleAuthStateChanged);
    return subscriber; // unsubscribe on unmount
  }, []);

  if (initializing) return null;

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Login please</Text>
        <Button
          title="Sign in with Google"
          onPress={() => onGoogleButtonPress()}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Text>Welcome, {user.email} !</Text>
      <Image
        source={{ uri: user.photoURL }}
        style={{ height: 300, width: 300, borderRadius: 150, margin: 50 }}
      />
      <Button title="Sign Out" onPress={() => logout()} />
        <FirestoreDemo />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    paddingTop: 60,
  },
});
