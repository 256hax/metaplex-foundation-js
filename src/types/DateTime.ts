import BN from 'bn.js';
import { assert, Opaque, Option } from '@/utils';
import { BigNumberValues } from './BigNumber';

export type DateTimeString = string;
export type DateTimeValues = DateTimeString | BigNumberValues | Date;
export type DateTime = Opaque<BN, 'DateTime'>;

export const toDateTime = (value: DateTimeValues): DateTime => {
  if (typeof value === 'string' || isDateObject(value)) {
    const date = new Date(value);
    const timestamp = Math.floor(date.getTime() / 1000);
    return new BN(timestamp) as DateTime;
  }

  return new BN(value) as DateTime;
};

export const toOptionDateTime = (
  value: Option<DateTimeValues>
): Option<DateTime> => {
  return value === null ? null : toDateTime(value);
};

export const isDateTime = (value: any): value is DateTime => {
  return value?.__opaque__ === 'DateTime';
};

export function assertDateTime(value: any): asserts value is DateTime {
  assert(isDateTime(value), 'Expected DateTime type');
}

const isDateObject = (value: any): value is Date => {
  return Object.prototype.toString.call(value) === '[object Date]';
};
