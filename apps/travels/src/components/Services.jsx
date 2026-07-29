import { services } from '../data';
import Title from './Title';

const Services = () => {
  return (
    <section className='section services' id='services'>
      <Title title='Our' subTitle='Services' />
      <div className='section-center services-center'>
        {services.map(({ id, icon, title, text }) => (
          <article className='service' key={id}>
            <span className='service-icon'>
              <i className={icon}></i>
            </span>
            <div className='service-info'>
              <h3 className='service-title'>{title}</h3>
              <p className='service-text'>{text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
export default Services;
