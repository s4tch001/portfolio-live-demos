import about from '../images/about2.jpeg';
import Title from './Title';

const About = () => {
  return (
    <section className='section' id='about'>
      <Title title='About' subTitle='Us' />

      <div className='section-center about-center'>
        <div className='about-img'>
          <img src={about} className='about-photo' alt='awesome beach' />
        </div>
        <article className='about-info'>
          <h3>explore the difference</h3>
          <p>
            P Travels presents thoughtfully planned sample itineraries that
            balance memorable destinations, comfortable stays, and practical
            travel time.
          </p>
          <p>
            Every tour shown here is fictional preview content created to
            demonstrate the website experience; no booking or payment is
            processed by this portfolio demo.
          </p>
          <a href='#about' className='btn'>
            read more
          </a>
        </article>
      </div>
    </section>
  );
};
export default About;
