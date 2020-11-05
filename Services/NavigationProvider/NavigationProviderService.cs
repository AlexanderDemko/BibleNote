using System.Collections.Generic;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Services.NavigationProvider.Contracts;

namespace BibleNote.Services.NavigationProvider
{
    class NavigationProviderService : INavigationProviderService
    {
        private readonly ITrackingDbContext dbContext;

        public NavigationProviderService(ITrackingDbContext analyticsContext)
        {
            this.dbContext = analyticsContext;
        }

        public Task<IList<NavigationProviderInfo>> GetNavigationProvidersInfoAsync()
        {
            return this.dbContext.NavigationProvidersInfo.ToListAsync();
        }

        public async Task DeleteNavigationProvider(int navigationProviderId)
        {
            await this.dbContext.VerseRelationRepository.DeleteAsync(
                v => v.DocumentParagraph.Document.Folder.NavigationProviderId == navigationProviderId);

            await this.dbContext.VerseEntryRepository.DeleteAsync(
                v => v.DocumentParagraph.Document.Folder.NavigationProviderId == navigationProviderId);

            await this.dbContext.DocumentParagraphRepository.DeleteAsync(
                p => p.Document.Folder.NavigationProviderId == navigationProviderId);

            await this.dbContext.DocumentRepository.DeleteAsync(
                d => d.Folder.NavigationProviderId == navigationProviderId);

            await this.dbContext.DocumentFolderRepository.DeleteAsync(
                f => f.NavigationProviderId == navigationProviderId);

            await this.dbContext.AnalysisSessions.DeleteAsync(
                s => s.NavigationProviderId == navigationProviderId);

            await this.dbContext.NavigationProvidersInfo.DeleteAsync(
                p => p.Id == navigationProviderId);
        }
    }
}
