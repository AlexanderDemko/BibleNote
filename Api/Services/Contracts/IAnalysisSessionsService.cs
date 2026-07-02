using BibleNote.Domain.Entities;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Services.Contracts
{
    public interface IAnalysisSessionsService
    {
        Task<AnalysisSession> GetActualSession(int navigationProviderId, CancellationToken cancellationToken = default);
    }
}
