import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor:"#1E3A8A",
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
          fontWeight: "600",
        },
        tabBarActiveTintColor: "#1E3A8A",
        tabBarInactiveTintColor: "#999",
      }}
    >
      <Tabs.Screen
        name="homepage"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="personalizedsuggestionpage"
        options={{
          title: "Suggestions",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bulb" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
      name = "resiliencepage"
      options={{
        title:"Resilience",
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="shield-checkmark-outline" size={size} color={color} />
        ),
      }}
      />      

<Tabs.Screen
  name="contingencypage"
  options={{
    title: "Contingency",
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="alert-circle-outline" size={size} color={color} />
    ),
  }}
/>

 <Tabs.Screen
  name="settingspage"
  options={{
    title: "Settings",
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="settings" size={size} color={color} />
    ),
  }}
/>

    </Tabs>
  );
} 