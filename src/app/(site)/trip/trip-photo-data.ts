export type TripPhoto = {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

export const BEACH_PHOTOS: TripPhoto[] = [
  {
    src: "/trip/balcony-view.png",
    width: 1024,
    height: 575,
    alt: "View from the rental balcony over the dunes and white sand to the Gulf of Mexico, bright blue water under a sunny sky.",
    caption: "Beach & Gulf from the balcony—dunes, sand, and water a short walk away.",
  },
  {
    src: "/trip/aerial-location.png",
    width: 1024,
    height: 574,
    alt: "Aerial view of the Santa Rosa Beach shoreline with the Gulf on the west and the beachfront building marked by a map pin.",
    caption: "From above: the pin marks our building on the dunes, just above the beach.",
  },
];

export const GUEST_SPACE_PHOTOS: TripPhoto[] = [
  {
    src: "/trip/guest-bedroom.png",
    width: 1024,
    height: 580,
    alt: "Bright guest bedroom with queen bed, coastal art, sliding glass door to a deck with a grill, and a distant view of dunes and the Gulf.",
    caption:
      "Queen guest room—opens to the deck; natural light and a peek of the dunes and Gulf.",
  },
  {
    src: "/trip/guest-living.png",
    width: 1024,
    height: 573,
    alt: "Living area with blue sectional sofa, wicker coffee table, coastal wall art, wood ceiling, and hallway toward other rooms.",
    caption:
      "Living area with the double sofa bed—where extra guests sleep—plus seating and TV.",
  },
];
