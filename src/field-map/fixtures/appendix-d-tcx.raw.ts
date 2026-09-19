/** 附录 D.1 TCX 样本的 xml2js 配置 B 解析形态 */
export const APPENDIX_D_TCX_RAW = {
  TrainingCenterDatabase: {
    $: {
      xmlns: 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2',
    },
    Activities: [
      {
        Activity: [
          {
            $: { Sport: 'Running' },
            Id: ['2016-05-21T23:32:02Z'],
            Notes: ['joyrun_47944382'],
            Lap: [
              {
                $: { StartTime: '2016-05-21T23:32:02Z' },
                TotalTimeSeconds: ['10'],
                DistanceMeters: ['16.0'],
                MaximumSpeed: ['3.5'],
                Calories: ['3'],
                AverageHeartRateBpm: [{ Value: ['152'] }],
                MaximumHeartRateBpm: [{ Value: ['169'] }],
                Intensity: ['Active'],
                Cadence: ['84'],
                TriggerMethod: ['Manual'],
                Track: [
                  {
                    Trackpoint: [
                      {
                        Time: ['2016-05-21T23:32:02Z'],
                        Position: [
                          {
                            LatitudeDegrees: ['40.010692'],
                            LongitudeDegrees: ['116.388015'],
                          },
                        ],
                        AltitudeMeters: ['40.27'],
                        HeartRateBpm: [{ Value: ['115'] }],
                      },
                      {
                        Time: ['2016-05-21T23:32:07Z'],
                        Position: [
                          {
                            LatitudeDegrees: ['40.010696'],
                            LongitudeDegrees: ['116.388114'],
                          },
                        ],
                        AltitudeMeters: ['40.27'],
                        DistanceMeters: ['8.0'],
                        HeartRateBpm: [{ Value: ['117'] }],
                        Cadence: ['84'],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
} as const;

export const APPENDIX_D_EXTENSIONS = {
  TrainingCenterDatabase: {
    $: { xmlns: 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2' },
    Activities: [
      {
        Activity: [
          {
            Notes: ['joyrun_47944382'],
            Lap: [
              {
                Intensity: ['Active'],
              },
            ],
          },
        ],
      },
    ],
  },
};
