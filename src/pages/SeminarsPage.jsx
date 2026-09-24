import { userMessage } from '../lib/errors';
import { useEffect, useState } from 'react';
import SectionTitle from '../components/SectionTitle';
import SeminarCard from '../components/SeminarCard';
import { listCoursePage } from '../lib/courseService';
import { useAuth } from '../context/AuthContext';

export default function SeminarsPage() {
  const { user } = useAuth();
  const [page,setPage]=useState(0);
  const [total,setTotal]=useState(0);
  const [seminars, setSeminars] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller=new AbortController();
    setLoading(true);setError('');
    listCoursePage(user,page,12,controller.signal)
      .then(({items,count})=>{if(!controller.signal.aborted){setSeminars(items);setTotal(count);}})
      .catch((err)=>{if(!controller.signal.aborted)setError(userMessage(err));})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  }, [user?.id,user?.role,page]);

  return (
    <section className="page-section top-spaced">
      <div className="container">
        <SectionTitle
          eyebrow="Каталог"
          title="Все семинары и тренинги"
          text="Выберите семинар, ознакомьтесь с описанием и зарегистрируйтесь. После регистрации материалы откроются в формате курса с разделами, видео, текстом и PDF."
        />

        {loading ? <div className="card content-card">Загрузка семинаров...</div> : null}
        {error ? <div className="card content-card error-card">{error}</div> : null}

        {!loading && !error ? (
          seminars.length ? (
            <div className="cards-grid">
              {seminars.map((seminar) => (
                <SeminarCard key={seminar.uuid} seminar={seminar} />
              ))}
            </div>
          ) : (
            <div className="card content-card">Семинары пока не добавлены.</div>
          )
        ) : null}
        {total>12?<div className="form-actions"><button className="ghost-inline-button" disabled={loading||page===0} onClick={()=>setPage(p=>p-1)}>Назад</button><span>Страница {page+1} из {Math.ceil(total/12)}</span><button className="ghost-inline-button" disabled={loading||(page+1)*12>=total} onClick={()=>setPage(p=>p+1)}>Далее</button></div>:null}
      </div>
    </section>
  );
}
