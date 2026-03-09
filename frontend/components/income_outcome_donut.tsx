import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface Props {
  income: number;
  outcome: number;
  size?: number;
  strokeWidth?: number;
}

export default function IncomeOutcomeDonut({
  income,
  outcome,
  size = 140,
  strokeWidth = 15,
}: Props) {

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const incomeOffset =
    circumference - (income / 100) * circumference;

  const outcomeOffset =
    circumference - (outcome / 100) * circumference;

  return (
    <View style={{ width: size, height: size }}>

      <Svg width={size} height={size}>

        {/* Outcome ring */}
        <Circle
          stroke="#EF4444"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={outcomeOffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />

        {/* Income ring */}
        <Circle
          stroke="#22C55E"
          fill="none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={incomeOffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />

      </Svg>

      <View style={styles.center}>
        <Text style={styles.textIncome}>{Math.round(income)}%</Text>
        <Text style={styles.textOutcome}>{Math.round(outcome)}%</Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    alignItems: "center",
    top: "35%",
    left: 0,
    right: 0,
  },

  textIncome: {
    fontSize: 14,
    color: "#22C55E",
    fontWeight: "600",
  },

  textOutcome: {
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "600",
  },
});