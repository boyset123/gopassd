import React, { useState } from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import Timer from './Timer';
import { API_BASE_URL } from '../config/api';
import { profilePictureUri } from '../utils/profilePictureUri';

interface Employee {
  _id: string;
  name: string;
  email?: string;
  profilePicture?: string;
}

export interface MonitoringPassSlip {
  _id: string;
  employee: Employee;
  timeOut: string;
  estimatedTimeBack: string;
  destination: string;
  departureTime?: string;
  type: 'slip';
}

const colFit = { minWidth: 0 as const };

export interface MonitoringActivePassSlipsCardProps {
  styles: Record<string, unknown>;
  slips: MonitoringPassSlip[];
  onView: (slip: MonitoringPassSlip) => void;
}

export default function MonitoringActivePassSlipsCard({
  styles,
  slips,
  onView,
}: MonitoringActivePassSlipsCardProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const s = styles as Record<string, object>;

  return (
    <View style={styles.monitoringCard}>
      <Text style={styles.sectionTitle}>Active Pass Slips ({slips.length})</Text>
      <View style={s.monitoringTableCard}>
        <View style={s.monitoringTableInner}>
          <View style={s.monitoringTableHeader}>
            <Text style={[s.monitoringHeaderText, s.monitoringColEmployee, colFit]}>Employee</Text>
            <Text style={[s.monitoringHeaderText, s.monitoringColDestination, colFit]}>Destination</Text>
            <Text style={[s.monitoringHeaderText, s.monitoringColTimeOut, colFit]}>Schedule</Text>
            <Text style={[s.monitoringHeaderText, s.monitoringColTimer, colFit]}>Timer</Text>
            <Text style={[s.monitoringHeaderText, s.monitoringColActions]}>Actions</Text>
          </View>

          {slips.length === 0 ? (
            <View style={s.monitoringEmptyState}>
              <Text style={s.monitoringEmptyTitle}>No active pass slips</Text>
              <Text style={s.monitoringEmptySubtitle}>
                Verified slips currently out on campus will appear here.
              </Text>
            </View>
          ) : (
            slips.map((item, index) => {
              const isHovered = hoveredRow === item._id;
              return (
                <Pressable
                  key={item._id}
                  onPress={() => onView(item)}
                  onHoverIn={Platform.OS === 'web' ? () => setHoveredRow(item._id) : undefined}
                  onHoverOut={Platform.OS === 'web' ? () => setHoveredRow(null) : undefined}
                  style={[
                    s.monitoringTableRow,
                    index % 2 === 1 && s.monitoringTableRowAlt,
                    isHovered && s.monitoringTableRowHover,
                  ]}
                >
                  <View style={[s.monitoringColEmployee, colFit, s.monitoringEmployeeCell]}>
                    <Image
                      source={{
                        uri: profilePictureUri(
                          item.employee?.profilePicture,
                          API_BASE_URL,
                          'https://via.placeholder.com/48'
                        ),
                      }}
                      style={s.monitoringAvatar}
                    />
                    <View style={s.monitoringEmployeeMeta}>
                      <Text style={s.monitoringEmployeeName} numberOfLines={1}>
                        {item.employee?.name || 'N/A'}
                      </Text>
                      {item.employee?.email ? (
                        <Text style={s.monitoringEmployeeEmail} numberOfLines={1}>
                          {item.employee.email}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={[s.monitoringColDestination, colFit]}>
                    <Text
                      style={s.monitoringDestinationText}
                      numberOfLines={2}
                      {...(Platform.OS === 'web' ? ({ title: item.destination } as object) : {})}
                    >
                      {item.destination || '—'}
                    </Text>
                  </View>

                  <View style={[s.monitoringColTimeOut, colFit, s.monitoringScheduleCell]}>
                    <Text style={s.monitoringSchedulePrimary} numberOfLines={1}>
                      Out {item.timeOut || '—'}
                    </Text>
                    <Text style={s.monitoringScheduleSecondary} numberOfLines={1}>
                      Est. return {item.estimatedTimeBack || '—'}
                    </Text>
                  </View>

                  <View style={[s.monitoringColTimer, colFit, s.monitoringTimerCell]}>
                    {item.departureTime && item.estimatedTimeBack ? (
                      <Timer
                        pill
                        timeOut={item.timeOut}
                        estimatedTimeBack={item.estimatedTimeBack}
                        departureTime={item.departureTime}
                      />
                    ) : (
                      <Text style={s.monitoringScheduleSecondary}>—</Text>
                    )}
                  </View>

                  <View style={[s.monitoringColActions, s.monitoringActionsCell]}>
                    <Pressable
                      style={[styles.viewButton, isHovered && s.viewButtonHover]}
                      onPress={(e) => {
                        if (Platform.OS === 'web') (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
                        onView(item);
                      }}
                    >
                      <Text style={styles.viewButtonText}>View</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </View>
    </View>
  );
}
