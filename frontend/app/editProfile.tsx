import { BASE_URL } from "@/services/api";
import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function EditProfile() {

  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    fetchUser();
  }, []);

  const pickImage = async () => {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      alert("Permission required to access gallery");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) return;

    const image = result.assets[0];

    const token = await SecureStore.getItemAsync("accessToken");

    const formData = new FormData();
    formData.append("file", {
      uri: image.uri,
      name: "profile.jpg",
      type: "image/jpeg",
    } as any);

    const response = await fetch(`${BASE_URL}/api/v1/auth/profile-photo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    setUser((prev:any) => ({
      ...prev,
      profile_photo: data.profile_photo,
    }));

  } catch (error) {
    console.log("Upload failed:", error);
  }
};

  const fetchUser = async () => {
    try {
      const token = await SecureStore.getItemAsync("accessToken");

      const response = await fetch(`${BASE_URL}/api/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      setUser(data);
      setName(data.name);

    } catch (error) {
      console.log("Failed to load user:", error);
    }
  };

  const handleSave = async () => {
  try {
    const token = await SecureStore.getItemAsync("accessToken");

    const response = await fetch(`${BASE_URL}/api/v1/auth/update`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: name,
      }),
    });

    const data = await response.json();

    setUser(data);

    console.log("Profile updated");

  } catch (error) {
    console.log("Update failed:", error);
  }
};

  if (!user) {
    return <Text>Loading...</Text>;
  }

  return (
    <View style={styles.container}>

      <View style={styles.avatarContainer}>
        <Image
          source={{
            uri:
              user.profile_photo ||
              "https://cdn-icons-png.flaticon.com/512/847/847969.png"
          }}
          style={styles.avatar}
        />

        <TouchableOpacity onPress={pickImage}>
  <Text style={styles.changePhoto}>Change Photo</Text>
</TouchableOpacity>
      </View>

      <Text style={styles.label}>Name</Text>
<TextInput
  style={styles.input}
  value={name}
  onChangeText={setName}
/>

      <Text style={styles.label}>Email</Text>
<TextInput
  style={styles.input}
  value={user?.email || ""}
  editable={false}
/>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveText}>Save Changes</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff"
  },

  avatarContainer: {
    alignItems: "center",
    marginBottom: 30
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10
  },

  changePhoto: {
    color: "#1E3A8A",
    fontWeight: "600"
  },

  label: {
    fontSize: 14,
    marginBottom: 6,
    color: "#666"
  },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginBottom: 18
  },

  saveBtn: {
    backgroundColor: "#1E3A8A",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10
  },

  saveText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16
  }

});