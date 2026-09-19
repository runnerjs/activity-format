import {
  GARMIN_PRODUCT_BY_ID,
  garminProductToLabel,
} from './garmin-product';

describe('garminProductToLabel', () => {
  it('按编号和 SDK 标识查表', () => {
    expect(garminProductToLabel(2396)).toBe('Forerunner 235 (Asia)');
    expect(garminProductToLabel(2431)).toBe('Forerunner 235');
    expect(garminProductToLabel('fr235Asia')).toBe('Forerunner 235 (Asia)');
    expect(garminProductToLabel('fr235')).toBe('Forerunner 235');
  });

  it('未知编号保留 Garmin ${id}', () => {
    expect(garminProductToLabel(1619)).toBe('Garmin 1619');
    expect(GARMIN_PRODUCT_BY_ID[1619]).toBeUndefined();
  });

  it('未入库 slug 按前缀和地区后缀美化', () => {
    expect(garminProductToLabel('fr265Asia')).toBe('Forerunner 265 (Asia)');
    expect(garminProductToLabel('fenix8')).toBe('Fenix 8');
  });
});
