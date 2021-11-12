export interface Astronaut {
  id: string;
}

export interface Mission {
  id: string;
  designation: string;
  crew: string[];
  startDate: string | null;
  endDate: string | null;
  type: string;
  vehicleID: string;
}

export const missions = [
  {
    id: "1",
    designation: "Apollo 1",
    crew: ["14", "30", "7"],
    startDate: null,
    endDate: null,
    type: "ACCIDENT",
    vehicleID: "1"
  },
  {
    id: "2",
    designation: "Apollo 4",
    crew: [],
    startDate: "1967-11-09T12:00:01.000Z",
    endDate: "1967-11-09T20:37:00.000Z",
    type: "UNCREWED_EARTH_ORBITING",
    vehicleID: "2"
  },
  {
    id: "3",
    designation: "Apollo 5",
    crew: [],
    startDate: "1968-01-22T22:48:09.000Z",
    endDate: "1968-01-23T09:58:00.000Z",
    type: "UNCREWED_EARTH_ORBITING",
    vehicleID: "1"
  },
  {
    id: "4",
    designation: "Apollo 6",
    crew: [],
    startDate: "1968-04-04T12:00:01.000Z",
    endDate: "1968-04-04T21:57:21.000Z",
    type: "UNCREWED_EARTH_ORBITING",
    vehicleID: "2"
  },
  {
    id: "5",
    designation: "Apollo 7",
    crew: ["23", "10", "12"],
    startDate: "1968-10-11T15:02:45.000Z",
    endDate: "1968-10-22T11:11:48.000Z",
    type: "CREWED_EARTH_ORBITING",
    vehicleID: "1"
  },
  {
    id: "6",
    designation: "Apollo 8",
    crew: ["5", "18", "2"],
    startDate: "1968-12-21T12:51:00.000Z",
    endDate: "1968-12-27T15:51:42.000Z",
    type: "LUNAR_ORBITING",
    vehicleID: "2"
  },
  {
    id: "7",
    designation: "Apollo 9",
    crew: ["20", "26", "25"],
    startDate: "1969-03-03T16:00:00.000Z",
    endDate: "1969-03-13T17:00:54.000Z",
    type: "UNCREWED_EARTH_ORBITING",
    vehicleID: "2"
  },
  {
    id: "8",
    designation: "Apollo 10",
    crew: ["28", "31", "6"],
    startDate: "1969-05-18T16:49:00.000Z",
    endDate: "1969-05-26T16:52:23.000Z",
    type: "LUNAR_ORBITING",
    vehicleID: "2"
  },
  {
    id: "9",
    designation: "Apollo 11",
    crew: ["3", "1", "8"],
    startDate: "1969-07-16T13:32:00.000Z",
    endDate: "1969-07-24T16:50:35.000Z",
    type: "LUNAR_LANDING",
    vehicleID: "2"
  },
  {
    id: "10",
    designation: "Apollo 12",
    crew: ["9", "15", "4"],
    startDate: "1969-11-14T16:22:00.000Z",
    endDate: "1969-11-24T20:58:24.000Z",
    type: "LUNAR_LANDING",
    vehicleID: "2"
  },
  {
    id: "11",
    designation: "Apollo 13",
    crew: ["18", "29", "16"],
    startDate: "1970-04-11T19:13:00.000Z",
    endDate: "1970-04-17T18:07:41.000Z",
    type: "LUNAR_LANDING",
    vehicleID: "2"
  },
  {
    id: "12",
    designation: "Apollo 14",
    crew: ["27", "22", "21"],
    startDate: "1971-01-31T21:03:02.000Z",
    endDate: "1971-02-09T21:05:00.000Z",
    type: "LUNAR_LANDING",
    vehicleID: "2"
  },
  {
    id: "13",
    designation: "Apollo 15",
    crew: ["26", "32", "17"],
    startDate: "1971-07-26T13:34:00.600Z",
    endDate: "1971-08-07T20:45:53.000Z",
    type: "LUNAR_LANDING",
    vehicleID: "2"
  },
  {
    id: "14",
    designation: "Apollo 16",
    crew: ["31", "19", "11"],
    startDate: "1972-04-16T17:54:00.000Z",
    endDate: "1972-04-27T19:45:05.000Z",
    type: "LUNAR_LANDING",
    vehicleID: "2"
  },
  {
    id: "15",
    designation: "Apollo 17",
    crew: ["6", "13", "24"],
    startDate: "1972-12-07T05:33:00.000Z",
    endDate: "1972-12-19T19:24:59.000Z",
    type: "LUNAR_LANDING",
    vehicleID: "2"
  }
];
