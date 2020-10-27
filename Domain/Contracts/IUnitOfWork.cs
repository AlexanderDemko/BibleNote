using System;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Domain.Contracts
{
    public interface IUnitOfWork
    {
        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

        Task DoInTransactionAsync(Func<CancellationToken, Task> action, CancellationToken cancellationToken = default);
    }
}
