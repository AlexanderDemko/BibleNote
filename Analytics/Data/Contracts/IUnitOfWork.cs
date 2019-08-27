using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Domain.Contracts
{
    public interface IUnitOfWork
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

        int SaveChanges();

        IQueryable<T> Include<T, TProperty>(
            IQueryable<T> query, Expression<Func<T, TProperty>> path, CancellationToken cancellationToken = default) 
            where T : class;

        Task<IList<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        IList<T> ToList<T>(IQueryable<T> query);

        Task<T> SingleAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        T Single<T>(IQueryable<T> query);

        Task<T> SingleOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        T SingleOrDefault<T>(IQueryable<T> query);

        Task<T> FirstAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        T First<T>(IQueryable<T> query);

        Task<T> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        T FirstOrDefault<T>(IQueryable<T> query);

        Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        bool Any<T>(IQueryable<T> query);

        Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        int Count<T>(IQueryable<T> query);
    }
}
