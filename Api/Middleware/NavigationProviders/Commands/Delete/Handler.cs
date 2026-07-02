using BibleNote.Domain.Contracts;
using MediatR;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Middleware.NavigationProviders.Commands.Delete
{
    public class Handler : IRequestHandler<Request>
    {
        private readonly ITrackingDbContext dbContext;

        public Handler(ITrackingDbContext dbContext)
        {
            this.dbContext = dbContext;
        }

        public async Task<Unit> Handle(Request request, CancellationToken cancellationToken)
        {
            var navigationProviderId = request.NavigationProviderId;

            await dbContext.VerseRelationRepository.DeleteAsync(
                v => v.DocumentParagraph.Document.Folder.NavigationProviderId == navigationProviderId,
                cancellationToken);

            await dbContext.VerseEntryRepository.DeleteAsync(
                v => v.DocumentParagraph.Document.Folder.NavigationProviderId == navigationProviderId,
                cancellationToken);

            await dbContext.DocumentParagraphRepository.DeleteAsync(
                p => p.Document.Folder.NavigationProviderId == navigationProviderId,
                cancellationToken);

            await dbContext.DocumentRepository.DeleteAsync(
                d => d.Folder.NavigationProviderId == navigationProviderId,
                cancellationToken);

            await dbContext.DocumentFolderRepository.DeleteAsync(
                f => f.NavigationProviderId == navigationProviderId,
                cancellationToken);

            await dbContext.AnalysisSessions.DeleteAsync(
                s => s.NavigationProviderId == navigationProviderId,
                cancellationToken);

            await dbContext.NavigationProvidersInfo.DeleteAsync(
                p => p.Id == navigationProviderId,
                cancellationToken);

            return Unit.Value;
        }
    }
}
