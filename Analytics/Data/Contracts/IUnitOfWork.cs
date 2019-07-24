using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Data.Contracts
{
    public interface IUnitOfWork
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

        IQueryable<T> Include<T, TProperty>(
            IQueryable<T> query, Expression<Func<T, TProperty>> path, CancellationToken cancellationToken = default) 
            where T : class;

        Task<IList<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        Task<T> SingleAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        Task<T> SingleOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        Task<T> FirstAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        Task<T> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);

        Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default);
    }
}
