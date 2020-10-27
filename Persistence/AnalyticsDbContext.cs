using System;
using System.Threading;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;

namespace BibleNote.Persistence
{    
    public partial class AnalyticsDbContext : DbContext, ITrackingDbContext, IReadOnlyDbContext
    {
        public DbSet<Document> Documents { get; set; }

        public DbSet<DocumentFolder> DocumentFolders { get; set; }

        public DbSet<DocumentParagraph> DocumentParagraphs { get; set; }

        public DbSet<VerseEntry> VerseEntries { get; set; }

        public DbSet<VerseRelation> VerseRelations { get; set; }

        public DbSet<NavigationProviderInfo> NavigationProvidersInfo { get; set; }

        #region IReadOnlyDbContext

        IReadOnlyRepository<Document> IReadOnlyDbContext.DocumentRepository => new EfRepository<Document>(this, asNoTracking: true);
        IReadOnlyRepository<DocumentFolder> IReadOnlyDbContext.DocumentFolderRepository => new EfRepository<DocumentFolder>(this, asNoTracking: true);
        IReadOnlyRepository<DocumentParagraph> IReadOnlyDbContext.DocumentParagraphRepository => new EfRepository<DocumentParagraph>(this, asNoTracking: true);
        IReadOnlyRepository<VerseEntry> IReadOnlyDbContext.VerseEntryRepository => new EfRepository<VerseEntry>(this, asNoTracking: true);
        IReadOnlyRepository<VerseRelation> IReadOnlyDbContext.VerseRelationRepository => new EfRepository<VerseRelation>(this, asNoTracking: true);
        IReadOnlyRepository<NavigationProviderInfo> IReadOnlyDbContext.NavigationProvidersInfo => new EfRepository<NavigationProviderInfo>(this, asNoTracking: true);

        #endregion

        #region ITrackingDbContext

        ITrackingRepository<Document> ITrackingDbContext.DocumentRepository => new EfRepository<Document>(this, asNoTracking: false);
        ITrackingRepository<DocumentFolder> ITrackingDbContext.DocumentFolderRepository => new EfRepository<DocumentFolder>(this, asNoTracking: false);
        ITrackingRepository<DocumentParagraph> ITrackingDbContext.DocumentParagraphRepository => new EfRepository<DocumentParagraph>(this, asNoTracking: false);
        ITrackingRepository<VerseEntry> ITrackingDbContext.VerseEntryRepository => new EfRepository<VerseEntry>(this, asNoTracking: false);
        ITrackingRepository<VerseRelation> ITrackingDbContext.VerseRelationRepository => new EfRepository<VerseRelation>(this, asNoTracking: false);
        ITrackingRepository<NavigationProviderInfo> ITrackingDbContext.NavigationProvidersInfo => new EfRepository<NavigationProviderInfo>(this, asNoTracking: false);

        #endregion

        public async Task DoInTransactionAsync(Func<CancellationToken, Task> action, CancellationToken cancellationToken = default)
        {
            using (var transaction = await Database.BeginTransactionAsync(cancellationToken))
            {
                try
                {
                    await action(cancellationToken);
                    transaction.Commit();
                }
                catch
                {
                    transaction.Rollback();
                    throw;
                }
            }
        }

        #region Config

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            if (!optionsBuilder.IsConfigured)
            {
                optionsBuilder.UseSqlite("Data Source=BibleNote.Analytics.db");
            }
        }

        public AnalyticsDbContext(DbContextOptions<AnalyticsDbContext> options)
            : base(options)
        {
        }

        public AnalyticsDbContext()
        {
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.ApplyConfigurationsFromAssembly(typeof(AnalyticsDbContext).Assembly);
        }

        #endregion
    }
}
