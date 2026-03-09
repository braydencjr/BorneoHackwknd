import { useLocalSearchParams } from "expo-router";
import { Image, View } from "react-native";

export default function Receipt() {

  const { image } = useLocalSearchParams();

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Image
        source={{ uri: image as string }}
        style={{ flex: 1, resizeMode: "contain" }}
      />
    </View>
  );
}