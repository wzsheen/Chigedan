const test=require('node:test');const assert=require('node:assert/strict');
const {shouldPlayBirthdayVideo}=require('../utils/launch-schedule');const dates=require('../utils/birthday-dates');
test('regular lunar October 7 repeats annually and excludes adjacent dates',()=>{
 assert.equal(dates.length,81);assert.equal(new Set(dates).size,81);
 for(const key of dates){const t=Date.parse(key+'T04:00:00Z');assert.equal(shouldPlayBirthdayVideo(new Date(t)),true);assert.equal(shouldPlayBirthdayVideo(new Date(t-86400000)),false);assert.equal(shouldPlayBirthdayVideo(new Date(t+86400000)),false);}
 assert.equal(shouldPlayBirthdayVideo(new Date('2026-11-15T04:00:00Z')),true);assert.equal(shouldPlayBirthdayVideo(new Date('2026-11-03T04:00:00Z')),false);
});
test('China midnight boundaries and invalid or unsupported dates safely select normal welcome',()=>{
 for(const [iso,expected] of [['2026-11-14T15:59:59.999Z',false],['2026-11-14T16:00:00Z',true],['2026-11-15T15:59:59.999Z',true],['2026-11-15T16:00:00Z',false],['2101-11-01T00:00:00Z',false]])assert.equal(shouldPlayBirthdayVideo(new Date(iso)),expected);
 assert.equal(shouldPlayBirthdayVideo(new Date('bad')),false);assert.equal(shouldPlayBirthdayVideo(null),false);
});
