export default function CourseRating({ course }) {
  const count = course.ratingCount || 0;
  const label = count ? `Оценок: ${count}` : 'Пока нет оценок';
  return <span className="course-rating" title={count ? 'Средняя оценка участников' : 'До первой оценки отображается 5 из 5'}>
    <span aria-hidden="true">⭐</span>
    <span aria-label={`${course.rating ?? 5} из 5`}>{course.rating ?? 5}</span>
    <small>{label}</small>
  </span>;
}
