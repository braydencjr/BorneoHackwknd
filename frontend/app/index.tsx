import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function Landing() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/loginpage"); // go to login page
    }, 3000); // 3 seconds

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      
      {/* Top Gradient Section */}
      <LinearGradient
  colors={["#0F3D91", "#355FB3", "#6E8FBF", "#A9BFE3"]}
  start={{ x: 0, y: 0 }}
  end={{ x: 0, y: 1 }}
  style={styles.topSection}
>
        <View style={styles.circle} />
      </LinearGradient>

      {/* Bottom White Section */}
      <View style={styles.bottomSection}>
        <Text style={styles.title}>Welcome to AppName</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  topSection: {
    flex: 2,
    justifyContent: "center",
    alignItems: "center",
  },

  circle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#0F3D91",
  },

  bottomSection: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  title: {
    fontSize: 28,
    fontWeight: "500",
    textAlign: "center",
  },
});