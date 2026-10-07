import { router } from 'expo-router'
import { ArrowLeft, X } from 'lucide-react-native'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Animated, KeyboardAvoidingView, Platform, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/lib/theme'
import { Press } from './press'

export const GUTTER = 18
/** Height of the compact bar below the status bar. */
export const BAR_HEIGHT = 52
/** Space under the last item so it clears the tab bar and the floating + button. */
export const TAB_SCREEN_BOTTOM = 156

/**
 * Scroll-linked top bar state. Values run on the native driver; `collapsed` flips once past the large
 * title so the bar only takes touches when it is actually covering content.
 */
export function useCollapsingHeader(threshold = 44) {
  const scrollY = useRef(new Animated.Value(0)).current
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => setCollapsed((c) => (c ? value > threshold - 8 : value > threshold)))
    return () => scrollY.removeListener(id)
  }, [scrollY, threshold])
  const onScroll = Animated.event<NativeSyntheticEvent<NativeScrollEvent>>([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })
  return { scrollY, collapsed, onScroll, threshold }
}

/**
 * Page-coloured bar over the status bar. Invisible at the top of the page (the large title is the header);
 * once you scroll it fades in with a compact title and a hairline, so content never slides under the clock.
 */
export function CollapsingBar({ title, scrollY, collapsed, threshold, accessory }: { title: string; accessory?: ReactNode } & Omit<ReturnType<typeof useCollapsingHeader>, 'onScroll'>) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const backdrop = scrollY.interpolate({ inputRange: [0, 12], outputRange: [0, 1], extrapolate: 'clamp' })
  const reveal = scrollY.interpolate({ inputRange: [threshold - 12, threshold + 8], outputRange: [0, 1], extrapolate: 'clamp' })
  const lift = scrollY.interpolate({ inputRange: [threshold - 12, threshold + 8], outputRange: [6, 0], extrapolate: 'clamp' })
  return (
    <View pointerEvents={collapsed ? 'box-none' : 'none'} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
      {/* Status-bar backdrop: appears as soon as content starts moving under the clock. */}
      <Animated.View style={{ height: insets.top, backgroundColor: colors.page, opacity: backdrop }} />
      <Animated.View
        pointerEvents={collapsed ? 'auto' : 'none'}
        style={{
          height: BAR_HEIGHT,
          paddingHorizontal: GUTTER,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.page,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          opacity: reveal,
        }}
      >
        <Animated.Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, transform: [{ translateY: lift }] }}>
          {title}
        </Animated.Text>
        {accessory}
      </Animated.View>
    </View>
  )
}

/** Large page title with an optional line under it and an accessory on the right. */
export function LargeTitle({ title, subtitle, accessory }: { title: string; subtitle?: string; accessory?: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View style={{ marginBottom: 20, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" numberOfLines={1} style={{ color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.6 }}>
          {title}
        </Text>
        {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {accessory}
    </View>
  )
}

/** Tab screen scaffold: large title that collapses into a compact bar, scrollable body above the tab bar. */
export function Screen({
  title,
  compactTitle,
  subtitle,
  accessory,
  compactAccessory,
  children,
}: {
  title: string
  /** Shown in the bar once the large title has scrolled away (defaults to `title`). */
  compactTitle?: string
  subtitle?: string
  accessory?: ReactNode
  compactAccessory?: ReactNode
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const header = useCollapsingHeader()
  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        onScroll={header.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: GUTTER, paddingBottom: TAB_SCREEN_BOTTOM }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <LargeTitle title={title} subtitle={subtitle} accessory={accessory} />
        {children}
      </Animated.ScrollView>
      <CollapsingBar title={compactTitle ?? title} accessory={compactAccessory} {...header} />
    </View>
  )
}

/** Round 44dp icon button used in top bars. */
export function BarButton({ label, onPress, children, filled }: { label: string; onPress: () => void; children: ReactNode; filled?: boolean }) {
  const { colors } = useTheme()
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      feedback={filled ? 'scale' : 'opacity'}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? colors.brand : 'transparent',
      }}
    >
      {children}
    </Press>
  )
}

/**
 * Pushed screen scaffold (Settings, person, loan): a sticky bar with Back and optional actions; the title
 * appears in the bar once the large title has scrolled under it.
 */
export function StackScreen({ title, subtitle, actions, hero, children }: { title: string; subtitle?: string; actions?: ReactNode; hero?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const header = useCollapsingHeader(36)
  const reveal = header.scrollY.interpolate({ inputRange: [24, 52], outputRange: [0, 1], extrapolate: 'clamp' })
  const hairline = header.scrollY.interpolate({ inputRange: [0, 8], outputRange: [0, 1], extrapolate: 'clamp' })
  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <Animated.ScrollView
        onScroll={header.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + BAR_HEIGHT + 4, paddingHorizontal: GUTTER, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {hero ?? (
          <View style={{ marginBottom: 20 }}>
            <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.6 }}>
              {title}
            </Text>
            {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4 }}>{subtitle}</Text> : null}
          </View>
        )}
        {children}
      </Animated.ScrollView>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top, backgroundColor: colors.page }}>
        <View style={{ height: BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
          <BarButton label="Back" onPress={() => router.back()}>
            <ArrowLeft size={22} color={colors.text} />
          </BarButton>
          <Animated.Text numberOfLines={1} style={{ flex: 1, marginLeft: 6, color: colors.text, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, opacity: reveal }}>
            {title}
          </Animated.Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 6 }}>{actions}</View>
        </View>
        <Animated.View style={{ height: 1, backgroundColor: colors.border, opacity: hairline }} />
      </View>
    </View>
  )
}

/**
 * Modal form scaffold: a sticky title + close bar (hairline once the body scrolls), scrollable body,
 * keyboard-aware. Android resizes the window for the keyboard, so the focused field scrolls into view.
 */
export function FormScreen({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const scrollY = useRef(new Animated.Value(0)).current
  const hairline = scrollY.interpolate({ inputRange: [0, 8], outputRange: [0, 1], extrapolate: 'clamp' })
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: colors.page }}>
      <View style={{ paddingTop: insets.top, backgroundColor: colors.page, zIndex: 1 }}>
        <View style={{ height: BAR_HEIGHT + 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: GUTTER, paddingRight: GUTTER - 4 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }}>
            {title}
          </Text>
          <Press
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => router.back()}
            hitSlop={6}
            feedback="scale"
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted }}
          >
            <X size={19} color={colors.text} />
          </Press>
        </View>
        <Animated.View style={{ height: 1, backgroundColor: colors.border, opacity: hairline }} />
      </View>
      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: footer ? 24 : insets.bottom + 28 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Animated.ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.page }}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

/** Section heading used on every screen (web: card title). Sentence case, optional action and description. */
export function SectionHeader({
  title,
  action,
  onAction,
  right,
  description,
  first,
}: {
  title: string
  action?: string
  onAction?: () => void
  /** Anything else on the right (e.g. a total). */
  right?: ReactNode
  description?: string
  first?: boolean
}) {
  const { colors } = useTheme()
  return (
    <View style={{ marginTop: first ? 0 : 28, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.15 }}>
          {title}
        </Text>
        {action && onAction ? (
          <Press accessibilityRole="button" onPress={onAction} hitSlop={12}>
            <Text style={{ color: colors.textMuted, fontSize: 13.5, fontWeight: '500' }}>{action}</Text>
          </Press>
        ) : (
          right
        )}
      </View>
      {description ? <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{description}</Text> : null}
    </View>
  )
}

/** The one card: 1px border, white surface. */
export function Card({ children, padded = true, style }: { children: ReactNode; padded?: boolean; style?: object }) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        { borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
        padded ? { padding: 16 } : { paddingHorizontal: 14 },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** Hairline between rows inside a card. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme()
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: colors.borderSubtle }} />
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  const { colors } = useTheme()
  return (
    <View style={{ alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 24, paddingVertical: 32 }}>
      {icon ? (
        <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, marginBottom: 12 }}>{icon}</View>
      ) : null}
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      {description ? <Text style={{ color: colors.textMuted, fontSize: 13.5, marginTop: 4, textAlign: 'center', lineHeight: 19 }}>{description}</Text> : null}
      {action ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  )
}
