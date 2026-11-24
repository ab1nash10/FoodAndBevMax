import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, sendCode, signIn } from '../lib/api';
import { useSession } from '../lib/session';
import { Button, colors, styles as ui } from '../lib/ui';

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Try again.';

/** The portal's sign-in, on the phone: a code texted to the steward's registered mobile. */
export default function SignInScreen() {
  const current = useSession();
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (current.status === 'signedIn') return <Redirect href="/" />;

  const digits = mobile.replace(/\D/g, '');
  const run = async (step: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={ui.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={[ui.mark, styles.logo]}>
            <Text style={[ui.markText, { fontSize: 17 }]}>{'F&B'}</Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={styles.title}>
              Deliveries
            </Text>
            <Text style={ui.muted}>
              Sign in with a code sent to the mobile your admin registered.
            </Text>
          </View>

          <View style={[ui.card, { gap: 14 }]}>
            <View style={{ gap: 6 }}>
              <Text nativeID="mobile-label" style={styles.label}>
                Mobile number
              </Text>
              <TextInput
                accessibilityLabelledBy="mobile-label"
                autoComplete="tel"
                editable={!codeSent && !busy}
                inputMode="tel"
                maxLength={14}
                onChangeText={setMobile}
                placeholder="10-digit number"
                placeholderTextColor={colors.muted}
                style={[styles.input, codeSent && { backgroundColor: colors.page }]}
                value={mobile}
              />
            </View>

            {codeSent ? (
              <View style={{ gap: 6 }}>
                <Text nativeID="code-label" style={styles.label}>
                  6-digit code
                </Text>
                <TextInput
                  accessibilityLabelledBy="code-label"
                  autoComplete="one-time-code"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
                  style={[styles.input, styles.code]}
                  textContentType="oneTimeCode"
                  value={code}
                />
                <Text style={ui.muted}>We texted a code to {mobile}.</Text>
              </View>
            ) : null}

            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}

            {codeSent ? (
              <>
                <Button
                  busy={busy}
                  disabled={code.length !== 6}
                  label="Verify & sign in"
                  onPress={() => void run(() => signIn(digits, code))}
                />
                <Button
                  disabled={busy}
                  label="Change number"
                  onPress={() => {
                    setCodeSent(false);
                    setCode('');
                    setError(null);
                  }}
                  size="medium"
                  variant="ghost"
                />
              </>
            ) : (
              <Button
                busy={busy}
                disabled={digits.length < 10}
                label="Send code"
                onPress={() =>
                  void run(async () => {
                    await sendCode(digits);
                    setCodeSent(true);
                  })
                }
              />
            )}
          </View>
          <Text style={[ui.muted, { textAlign: 'center' }]}>
            Not registered? Contact the IT team.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 24, fontWeight: '700', letterSpacing: 10, textAlign: 'center' },
  error: {
    backgroundColor: colors.badSoft,
    borderRadius: 12,
    color: colors.bad,
    fontSize: 14,
    padding: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 18,
    height: 52,
    paddingHorizontal: 14,
  },
  label: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  logo: { borderRadius: 16, height: 56, width: 56 },
  page: { flexGrow: 1, gap: 24, padding: 22, paddingTop: 48 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
});
