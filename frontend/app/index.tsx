import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

export default function Landing() {
  const router = useRouter();

  // animation value
  const slideAnim = useRef(new Animated.Value(-200)).current;

  useEffect(() => {
    // start animation
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 800,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      router.replace("/loginpage");
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      
      {/* Animated Logo */}
      <Animated.View
        style={{
          transform: [{ translateX: slideAnim }],
        }}
      >
        <Image
          source={require("../assets/images/finsight.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Animated Title */}
      <Animated.Text
        style={[
          styles.title,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        Welcome To FinSight
      </Animated.Text>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },

  logo: {
    width: 280,
    height: 280,
  },

  title: {
    fontSize: 28,
    fontWeight: "600",
  },
});