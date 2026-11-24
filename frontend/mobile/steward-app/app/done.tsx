import { Redirect } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useDeliveries } from '../lib/deliveries';
import { itemCount, roomOf, timeOf } from '../lib/format';
import { useSession } from '../lib/session';
import { colors, Icon, Screen, styles as ui } from '../lib/ui';

/** Today's delivered orders, and those given back with why, newest first. */
export default function DoneScreen() {
  const current = useSession();
  const { orders } = useDeliveries();

  if (current.status !== 'signedIn') return <Redirect href="/sign-in" />;

  const at = (order: (typeof orders)[number]) => order.deliveredAt ?? order.undeliveredAt ?? '';
  const done = orders
    .filter((order) => order.status === 'COLLECTED' || order.undeliveredReason)
    .sort((a, b) => at(b).localeCompare(at(a)));

  return (
    <Screen back title="Delivered today">
      <FlatList
        contentContainerStyle={{ gap: 8, padding: 14 }}
        data={done}
        keyExtractor={(order) => order.id}
        ListEmptyComponent={
          <View style={[ui.card, { alignItems: 'center', paddingVertical: 28 }]}>
            <Text style={styles.empty}>Nothing delivered yet today</Text>
            <Text style={ui.muted}>Each order you deliver today is listed here.</Text>
          </View>
        }
        renderItem={({ item: order }) => {
          const delivered = order.status === 'COLLECTED';

          return (
            <View style={styles.row}>
              <View
                style={[
                  styles.mark,
                  { backgroundColor: delivered ? colors.okSoft : colors.badSoft },
                ]}
              >
                <Icon
                  color={delivered ? colors.ok : colors.bad}
                  name={delivered ? 'checkmark' : 'close'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.room}>{roomOf(order)}</Text>
                <Text style={{ color: delivered ? colors.muted : colors.bad, fontSize: 13 }}>
                  {delivered
                    ? `#${order.orderNumber} · ${itemCount(order)}`
                    : `#${order.orderNumber} · couldn’t deliver · ${order.undeliveredReason}`}
                </Text>
              </View>
              <Text style={ui.muted}>{timeOf(at(order))}</Text>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.text, fontSize: 16, fontWeight: '700' },
  mark: {
    alignItems: 'center',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  room: { color: colors.text, fontSize: 15, fontWeight: '800' },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
});
