import pino from 'pino';

interface LoggerConfig {
  level: string;
}

const REDACTED_FIELDS = ['refresh_token', 'recovery_code', 'pairing_token'];

export const createLogger = ({ level }: LoggerConfig, destination?: pino.DestinationStream) => {
  return pino({ level, redact: REDACTED_FIELDS }, destination);
};


