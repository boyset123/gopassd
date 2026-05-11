import React, { useState, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';

// `timeOut` is accepted for backwards compatibility but no longer used in the
// countdown. We anchor against the scheduled `estimatedTimeBack` so a late
// scan eats into the trip — matching the backend overdue rule in
// PUT /pass-slips/:id/return.
const Timer = ({ estimatedTimeBack, departureTime, onTimeShort, onTimeOver }: { timeOut?: string, estimatedTimeBack: string, departureTime?: string, onTimeShort?: () => void, onTimeOver?: () => void }) => {
  const calculateRemainingTime = () => {
    if (!estimatedTimeBack || !departureTime) return { hours: 0, minutes: 0, seconds: 0, isOver: true };

    const departureDate = new Date(departureTime);
    if (isNaN(departureDate.getTime())) {
      return { hours: 0, minutes: 0, seconds: 0, isOver: true };
    }

    const etbMatch = estimatedTimeBack.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!etbMatch) return { hours: 0, minutes: 0, seconds: 0, isOver: true };

    let h = parseInt(etbMatch[1], 10);
    const m = parseInt(etbMatch[2], 10);
    const ampm = etbMatch[3].toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;

    // Anchor the scheduled return to the same calendar date as the departure
    // stamp so the math is correct even if the user opens the screen the next
    // day, and handle cross-midnight trips.
    const etbDate = new Date(departureDate);
    etbDate.setHours(h, m, 0, 0);
    if (etbDate.getTime() < departureDate.getTime()) {
      etbDate.setDate(etbDate.getDate() + 1);
    }

    const now = new Date();
    const diff = etbDate.getTime() - now.getTime();

    const isOver = diff <= 0;
    const absDiff = Math.abs(diff);

    if (isOver) {
      return {
        hours: Math.floor(absDiff / (1000 * 60 * 60)),
        minutes: Math.floor((absDiff / 1000 / 60) % 60),
        seconds: Math.floor((absDiff / 1000) % 60),
        isOver: true,
      };
    }

    return {
      hours: Math.floor(diff / (1000 * 60 * 60)),
      minutes: Math.floor((diff / 1000 / 60) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      isOver: false,
    };
  };

    const [remainingTime, setRemainingTime] = useState(calculateRemainingTime);
    const [notificationSent, setNotificationSent] = useState(false);
  const [overtimeNotificationSent, setOvertimeNotificationSent] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const newRemainingTime = calculateRemainingTime();
      setRemainingTime(newRemainingTime);

      if (
        !newRemainingTime.isOver &&
        newRemainingTime.hours === 0 &&
        newRemainingTime.minutes < 5 &&
        !notificationSent
      ) {
                if (onTimeShort) {
          onTimeShort();
        }
        setNotificationSent(true);
      } else if (newRemainingTime.isOver && !overtimeNotificationSent) {
        if (onTimeOver) {
          onTimeOver();
        }
        setOvertimeNotificationSent(true);
      }
    }, 1000);

    return () => clearInterval(interval);
    }, [departureTime, estimatedTimeBack, notificationSent, onTimeShort, onTimeOver, overtimeNotificationSent]);

  const timerStyle = remainingTime.isOver ? [styles.timerText, styles.timerTextOver] : styles.timerText;

  return (
    <Text style={timerStyle}>
      {remainingTime.isOver ? '-' : ''}{String(remainingTime.hours).padStart(2, '0')}:
      {String(remainingTime.minutes).padStart(2, '0')}:
      {String(remainingTime.seconds).padStart(2, '0')}
    </Text>
  );
};

const styles = StyleSheet.create({
  timerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745', // Green
    marginTop: 10,
  },
  timerTextOver: {
    color: '#dc3545', // Red
  },
});

export default Timer;
