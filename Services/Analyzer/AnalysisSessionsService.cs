using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Services.Contracts;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Services.Analyzer
{
    class AnalysisSessionsService : IAnalysisSessionsService
    {
        private readonly ITrackingDbContext dbContext;

        public AnalysisSessionsService(ITrackingDbContext dbContext)
        {
            this.dbContext = dbContext;
        }

        public async Task<AnalysisSession> GetActualSession(int navigationProviderId, CancellationToken cancellationToken = default)
        {
            var analysisSession = await this.dbContext.AnalysisSessions
                .Where(s => s.NavigationProviderId == navigationProviderId)
                .Where(s => s.Status == AnalysisSessionStatus.NotStarted)
                .OrderByDescending(s => s.GetDocumentsInfoTime)
                .FirstOrDefaultAsync(cancellationToken);

            if (analysisSession == null)
            {
                analysisSession = new AnalysisSession()
                {
                    NavigationProviderId = navigationProviderId,
                    Status = AnalysisSessionStatus.NotStarted
                };

                this.dbContext.AnalysisSessions.Add(analysisSession);
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return analysisSession;
        }
    }
}
