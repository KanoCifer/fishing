/**
 * 天气映射的行为测试。
 *
 * 这一层是纯函数 —— 天气码怎么变成图标、变成天色、变成预报行，
 * 出来的结果直接决定界面上读到什么。改动落在这些函数上时，
 * 这里先响。
 *
 * 跑法：pnpm test
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { forecastDayLabel } from '../src/utils/date.ts';
import { forecastDays, weatherGroup, weatherIconSlug } from '../src/utils/weather.ts';
import { cardWeatherState, CARD_SKIES, IDLE_CLASS } from '../src/utils/weatherCard.ts';

const COMPONENT = new URL('../src/components/WeatherDaySwitcher/WeatherDaySwitcher.vue', import.meta.url);
const TOKENS = new URL('../src/styles/tokens/_color.scss', import.meta.url);

/** 造一天预报。字段给不全的那几个由这个函数补上 */
function day(overrides = {}) {
  return {
    fxDate: '2026-10-21',
    tempMax: '23.6',
    tempMin: '15.2',
    tempAvg: '',
    iconDay: '100',
    textDay: '晴',
    precipProbability: '0',
    ...overrides,
  };
}

describe('天气码 → 图标名', () => {
  it('按区间归组，不按码名归组', () => {
    assert.equal(weatherIconSlug('100'), 'clear-day');
    // 中雨到特大暴雨共用一枚图形
    assert.equal(weatherIconSlug('302'), 'rain');
    assert.equal(weatherIconSlug('305'), 'rain');
    assert.equal(weatherIconSlug('400'), 'snow');
    assert.equal(weatherIconSlug('404'), 'sleet');
  });

  it('认不出的码落兜底云', () => {
    assert.equal(weatherIconSlug('999'), 'cloudy');
    assert.equal(weatherIconSlug('12345'), 'cloudy');
    assert.equal(weatherIconSlug(''), 'cloudy');
    assert.equal(weatherIconSlug(null), 'cloudy');
    assert.equal(weatherIconSlug(undefined), 'cloudy');
    assert.equal(weatherIconSlug('不是数字'), 'cloudy');
  });
});

describe('天气码 → 外观组', () => {
  it('组是界面天色的依据', () => {
    assert.equal(weatherGroup('100'), 'sunny');
    assert.equal(weatherGroup('104'), 'overcast');
    assert.equal(weatherGroup('150'), 'night');
    assert.equal(weatherGroup('313'), 'rain');
    assert.equal(weatherGroup('400'), 'snow');
  });

  it('认不出的码落通用组', () => {
    assert.equal(weatherGroup('999'), 'generic');
    assert.equal(weatherGroup(''), 'generic');
  });
});

describe('卡片天气态', () => {
  it('雷是唯一带闪电的那一段天', () => {
    assert.equal(cardWeatherState('thunderstorms').sky, 'storm');
    assert.equal(cardWeatherState('thunderstorms-hail').sky, 'storm');
    assert.equal(CARD_SKIES.storm.flash, true);
    assert.equal(CARD_SKIES.rain.flash, false);
  });

  it('夜里是夜里，晴是晴', () => {
    assert.equal(cardWeatherState('clear-day').sky, 'clear');
    assert.equal(cardWeatherState('clear-night').sky, 'night');
    assert.equal(cardWeatherState('partly-cloudy-night').sky, 'night');
    assert.equal(cardWeatherState('cloudy').sky, 'cloudy');
    assert.equal(cardWeatherState('snow').sky, 'snow');
  });

  it('雨丝跟着天色走，不跟着图标走', () => {
    assert.equal(CARD_SKIES.rain.rain, true);
    assert.equal(CARD_SKIES.snow.rain, false);
  });
});

describe('预报日归一', () => {
  it('高低温取整 —— 小数对钓鱼的人没有意义', () => {
    const [one] = forecastDays([day({ tempMax: '23.6', tempMin: '15.2' })]);

    assert.equal(one.max, 24);
    assert.equal(one.min, 15);
  });

  it('缺高低温的那天整条丢掉 —— 「今天」是剩下的第一行', () => {
    const rows = forecastDays([day({ fxDate: '2026-10-21', tempMax: '', tempMin: '' }), day({ fxDate: '2026-10-22' })]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].fxDate, '2026-10-22');
  });

  it('日均温：上游有就用上游的', () => {
    const [one] = forecastDays([day({ tempAvg: '19.4' })]);

    assert.equal(one.avg, 19);
  });

  it('日均温：上游没给就由最高与最低折半', () => {
    const [one] = forecastDays([day({ tempMax: '23', tempMin: '15', tempAvg: '' })]);

    assert.equal(one.avg, 19);
  });

  it('天气现象用上游原文，不自己按码编词', () => {
    const [one] = forecastDays([day({ iconDay: '302', textDay: '中雨' })]);

    assert.equal(one.text, '中雨');
  });

  it('降水概率 0 是有效值', () => {
    const [one] = forecastDays([day({ precipProbability: '0' })]);

    assert.equal(one.prob, 0);
  });
});

describe('预报行首标签', () => {
  it('第一行是今天', () => {
    assert.equal(forecastDayLabel('2026-10-21', 0), '今天');
  });

  it('其余各行说星期', () => {
    assert.equal(forecastDayLabel('2026-10-21', 1), '周三');
    assert.equal(forecastDayLabel('2026-10-22', 2), '周四');
  });

  it('日期认不出来时不编一个词出来', () => {
    assert.equal(forecastDayLabel('不是日期', 1), '');
  });
});

describe('卡片样式与类型对得上', () => {
  it('每个待机动作都有对应的样式类', () => {
    const source = readFileSync(COMPONENT, 'utf8');

    for (const className of Object.values(IDLE_CLASS)) {
      assert.ok(source.includes(`.${className} {`), `样式里没有 ${className}`);
    }
  });

  it('每一档天色都在令牌那张表里', () => {
    const tokens = readFileSync(TOKENS, 'utf8');

    for (const tier of Object.keys(CARD_SKIES)) {
      assert.ok(tokens.includes(`'${tier}':`), `令牌表里没有 ${tier} 这一档`);
    }
  });
});
