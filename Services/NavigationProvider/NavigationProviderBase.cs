using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.DocumentProvider.Contracts;
using Newtonsoft.Json;

namespace BibleNote.Services.NavigationProvider
{
    public abstract class NavigationProviderBase<T, P> : INavigationProvider<T>
        where T : IDocumentId
        where P : INavigationProviderParameters
    {
        protected ITrackingDbContext DbContext { get; private set; }

        protected NavigationProviderBase(ITrackingDbContext dbContext)
        {
            DbContext = dbContext;
        }

        public abstract int Id { get; set; }

        public abstract string Name { get; set; }

        public abstract string Description { get; set; }

        public abstract bool IsReadonly { get; set; }

        public abstract P Parameters { get; set; }

        public string ParametersRaw
        {
            get => JsonConvert.SerializeObject(Parameters);
            set => Parameters = JsonConvert.DeserializeObject<P>(value);
        }

        public abstract IDocumentProvider GetProvider(T document);

        public abstract Task<IEnumerable<T>> LoadDocuments(
            AnalysisSession analysisSession, 
            bool newOnly, 
            bool updateDb = true, 
            CancellationToken cancellationToken = default);

        protected async Task SaveChanges(AnalysisSession analysisSession, CancellationToken cancellationToken)
        {
            await DbContext.SaveChangesAsync(cancellationToken);
            analysisSession.DeletedDocumentsCount = await DbContext.DocumentRepository
                .Where(d => d.LatestAnalysisSessionId != analysisSession.Id)
                .CountAsync();
            await DbContext.DocumentRepository.DeleteAsync(d => d.LatestAnalysisSessionId != analysisSession.Id);
            await DbContext.DocumentFolderRepository.DeleteAsync(d => d.LatestAnalysisSessionId != analysisSession.Id);
        }
    }
}
