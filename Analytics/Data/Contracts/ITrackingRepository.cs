using System;
using System.Collections.Generic;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Data.Contracts
{
    public interface ITrackingRepository<T> : IReadOnlyRepository<T> where T : class
    {
        new ITrackingRepository<T> Include<TProperty>(Expression<Func<T, TProperty>> navigationPropertyPath);

        new ITrackingRepository<T> Where(Expression<Func<T, bool>> predicate);

        new ITrackingRepository<TResult> Select<TResult>(Expression<Func<T, TResult>> selector) where TResult : class;

        new ITrackingRepository<TResult> SelectMany<TResult>(Expression<Func<T, IEnumerable<TResult>>> selector) where TResult : class;

        new ITrackingRepository<T> Skip(int count);

        new ITrackingRepository<T> Take(int count);

        new ITrackingRepository<T> OrderBy<TKey>(Expression<Func<T, TKey>> keySelector);

        new ITrackingRepository<T> OrderByDescending<TKey>(Expression<Func<T, TKey>> keySelector);

        void Add(T entity);

        void AddRange(params T[] entities);

        void Update(T entity);

        Task UpdateAsync(Expression<Func<T, T>> updateFactory, CancellationToken cancellationToken = default);

        void Delete(T entity);

        Task DeleteAsync(Expression<Func<T, bool>> predicate = default, CancellationToken cancellationToken = default);
    }

}
