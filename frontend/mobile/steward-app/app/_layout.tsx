import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AlertOverlay } from '../components/alert-overlay';
import { UndoBar } from '../components/undo-bar';
import { restoreSession } from '../lib/api';
import { DeliveriesProvider } from '../lib/deliveries';
import { useSession } from '../lib/session';
import { colors } from '../lib/ui';

export default function RootLayout() {
  const current = useSession();

  useEffect(() => {
    void restoreSession();
  }, []);

  if (current.status === 'loading') {
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: colors.page,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const screens = <Stack screenOptions={{ animation: 'slide_from_right', headerShown: false }} />;

  return (
    <>
      <StatusBar style="dark" />
      {current.status === 'signedIn' && current.permissions.includes('ORDER_DELIVER') ? (
        // Orders are checked, rung for and held for Undo on every screen while signed in.
        <DeliveriesProvider>
          {screens}
          <UndoBar />
          <AlertOverlay />
        </DeliveriesProvider>
      ) : (
        screens
      )}
    </>
  );
}
