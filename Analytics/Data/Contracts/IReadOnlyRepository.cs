using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Data.Contracts
{
    public interface IReadOnlyRepository<T> : IQueryable<T> where T : class
    {
        IQueryable<T> Query { get; }

        IReadOnlyRepository<T> Include<TProperty>(Expression<Func<T, TProperty>> navigationPropertyPath);

        ITrackingRepository<T> ToTrackingRepository();

        IReadOnlyRepository<T> Where(Expression<Func<T, bool>> predicate);

        IReadOnlyRepository<TResult> Select<TResult>(Expression<Func<T, TResult>> selector) where TResult: class;

        IReadOnlyRepository<TResult> SelectMany<TResult>(Expression<Func<T, IEnumerable<TResult>>> selector) where TResult: class;

        IReadOnlyRepository<T> Skip(int count);

        IReadOnlyRepository<T> Take(int count);

        IReadOnlyRepository<T> OrderBy<TKey>(Expression<Func<T, TKey>> keySelector);

        IReadOnlyRepository<T> OrderByDescending<TKey>(Expression<Func<T, TKey>> keySelector);

        Task<IList<T>> ToListAsync(CancellationToken cancellationToken = default);

        Task<T> SingleAsync(CancellationToken cancellationToken = default);

        Task<T> SingleOrDefaultAsync(CancellationToken cancellationToken = default);

        Task<T> FirstAsync(CancellationToken cancellationToken = default);

        Task<T> FirstOrDefaultAsync(CancellationToken cancellationToken = default);

        Task<bool> AnyAsync(CancellationToken cancellationToken = default);

        Task<int> CountAsync(CancellationToken cancellationToken = default);
    }

}
