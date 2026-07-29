import tour1 from './images/boracay.webp';
import tour2 from './images/palawan.webp';
import tour3 from './images/siargao.webp';
import tour4 from './images/baguio.webp';
import tour5 from './images/bohol.webp';
import tour6 from './images/vigan.webp';
import tour7 from './images/batanes.webp';
import tour8 from './images/cebu.webp';

export const pageLinks = [
  { id: 1, href: '#home', text: 'Home' },
  { id: 2, href: '#about', text: 'About' },
  { id: 3, href: '#services', text: 'Services' },
  { id: 4, href: '#tours', text: 'Tours' },
];

export const navIcons = [
  { id: 1, href: 'https://www.facebook.com', icon: 'fab fa-facebook' },
  { id: 2, href: 'https://www.x.com', icon: 'fab fa-x-twitter' },
  { id: 3, href: 'https://www.tiktok.com', icon: 'fab fa-tiktok' },
  { id: 4, href: 'https://www.instagram.com', icon: 'fab fa-instagram' },
];

export const services = [
  {
    id: 1,
    icon: 'fas fa-wallet fa-fw',
    title: 'affordable packages',
    text: `Enjoy budget-friendly travel packages across the Philippines without compromising quality. Perfect for barkada trips or solo travelers.`,
  },
  {
    id: 2,
    icon: 'fas fa-sun',
    title: 'island adventures',
    text: `Explore world-class beaches, hidden lagoons, and crystal-clear waters from Palawan to Siargao with guided island hopping tours.`,
  },
  {
    id: 3,
    icon: 'fas fa-hotel fa-fw',
    title: 'comfortable stays',
    text: `Stay in carefully selected hotels and resorts that provide comfort, safety, and convenience during your entire trip.`,
  },
];

export const toursData = [
  {
    id: 1,
    img: tour1,
    date: 'April 15th, 2026',
    title: 'Boracay Island Escape',
    text: `Relax on the famous white sand beaches of Boracay, enjoy vibrant nightlife, and experience thrilling water activities.`,
    location: 'Aklan',
    duration: '4 Days',
    price: 450,
  },
  {
    id: 2,
    img: tour2,
    date: 'May 10th, 2026',
    title: 'Palawan Underground River',
    text: `Discover the stunning limestone cliffs and explore the UNESCO-listed underground river in Puerto Princesa.`,
    location: 'Palawan',
    duration: '5 Days',
    price: 620,
  },
  {
    id: 3,
    img: tour3,
    date: 'June 5th, 2026',
    title: 'Siargao Surf Adventure',
    text: `Ride the waves at Cloud 9 and explore lagoons, rock pools, and island hopping destinations in Siargao.`,
    location: 'Surigao del Norte',
    duration: '5 Days',
    price: 500,
  },
  {
    id: 4,
    img: tour4,
    date: 'July 20th, 2026',
    title: 'Baguio Mountain Retreat',
    text: `Escape the heat and enjoy the cool climate, pine trees, and scenic views of the Summer Capital of the Philippines.`,
    location: 'Baguio City',
    duration: '3 Days',
    price: 300,
  },
  {
    id: 5,
    img: tour5,
    date: 'August 12th, 2026',
    title: 'Bohol Countryside Tour',
    text: `Visit the Chocolate Hills, see the tarsiers, and cruise along Loboc River in this relaxing countryside experience.`,
    location: 'Bohol',
    duration: '4 Days',
    price: 480,
  },
  {
    id: 6,
    img: tour6,
    date: 'September 8th, 2026',
    title: 'Vigan Heritage Walk',
    text: `Step back in time as you walk along Calle Crisologo and explore Spanish-era architecture and culture.`,
    location: 'Ilocos Sur',
    duration: '3 Days',
    price: 350,
  },
  {
    id: 7,
    img: tour7,
    date: 'October 18th, 2026',
    title: 'Batanes Nature Escape',
    text: `Experience breathtaking rolling hills, cliffs, and peaceful landscapes in the northernmost province of the Philippines.`,
    location: 'Batanes',
    duration: '6 Days',
    price: 900,
  },
  {
    id: 8,
    img: tour8,
    date: 'November 25th, 2026',
    title: 'Cebu Island Adventure',
    text: `Swim with whale sharks in Oslob, chase waterfalls in Kawasan, and explore Cebu’s rich history.`,
    location: 'Cebu',
    duration: '5 Days',
    price: 550,
  },
];
