import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';

// `timeOut` is accepted for backwards compatibility but no longer used in the
// countdown. We anchor against the scheduled `estimatedTimeBack` so a late
// scan eats into the trip — matching the backend overdue rule in
// PUT /pass-slips/:id/return.
const Timer = ({ estimatedTimeBack, departureTime }: { timeOut?: string, estimatedTimeBack: string, departureTime: string }) => {
  const calculateRemainingTime = () => {
    if (!estimatedTimeBack || !departureTime) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }

    const departureDate = new Date(departureTime);
    if (isNaN(departureDate.getTime())) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }

    const parseTime = (timeStr: string) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();

      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      return { hours, minutes };
    };

    const etbParts = parseTime(estimatedTimeBack);
    if (!etbParts) {
      return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };
    }

    // Anchor scheduled return to the departure date so cross-midnight trips
    // and next-day views resolve correctly.
    const etbDate = new Date(departureDate.getTime());
    etbDate.setHours(etbParts.hours, etbParts.minutes, 0, 0);
    if (etbDate.getTime() < departureDate.getTime()) {
      etbDate.setDate(etbDate.getDate() + 1);
    }

    const now = new Date();
    const diff = etbDate.getTime() - now.getTime();

    const isOverdue = diff <= 0;
    const absDiff = Math.abs(diff);

    return {
      hours: Math.floor(absDiff / (1000 * 60 * 60)),
      minutes: Math.floor((absDiff / 1000 / 60) % 60),
      seconds: Math.floor((absDiff / 1000) % 60),
      isOverdue: isOverdue,
    };
  };

  const [remainingTime, setRemainingTime] = useState(calculateRemainingTime);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingTime(calculateRemainingTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [departureTime, estimatedTimeBack]);

  const timerStyle = remainingTime.isOverdue ? styles.overdueText : styles.timerText;

  return (
    <Text style={timerStyle}>
      {remainingTime.isOverdue ? '-' : ''}{String(remainingTime.hours).padStart(2, '0')}:
      {String(remainingTime.minutes).padStart(2, '0')}:
      {String(remainingTime.seconds).padStart(2, '0')}
    </Text>
  );
};

const styles = StyleSheet.create({
  timerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#28a745', // Green for active countdown
  },
  overdueText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#dc3545', // Red for overdue
  },
});

export default Timer;
