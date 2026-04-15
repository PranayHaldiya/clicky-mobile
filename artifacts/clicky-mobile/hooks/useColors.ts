import { useColorScheme } from "react-native";
import colors from "@/constants/colors";

type ColorTokens = typeof colors.light;

export function useColors(): ColorTokens & { radius: number } {
  const scheme = useColorScheme();
  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
