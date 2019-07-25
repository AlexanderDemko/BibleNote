using BibleNote.Analytics.Data.Contracts;
using BibleNote.Analytics.Data.Entities;
using BibleNote.Analytics.Persistence.Repositories;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Persistence
{
    public partial class AnalyticsContext : DbContext, IDbContext
    {
        public DbSet<Document> Documents { get; set; }

        public DbSet<DocumentFolder> DocumentFolders { get; set; }

        public DbSet<DocumentParagraph> DocumentParagraphs { get; set; }

        public DbSet<VerseEntry> VerseEntries { get; set; }

        public DbSet<VerseRelation> VerseRelations { get; set; }

        #region IRepositoryContainer
        public IReadOnlyRepository<Document> DocumentRepository => new EfRepository<Document>(this);
        public IReadOnlyRepository<DocumentFolder> DocumentFolderRepository => new EfRepository<DocumentFolder>(this);
        public IReadOnlyRepository<DocumentParagraph> DocumentParagraphRepository => new EfRepository<DocumentParagraph>(this);
        public IReadOnlyRepository<VerseEntry> VerseEntryRepository => new EfRepository<VerseEntry>(this);
        public IReadOnlyRepository<VerseRelation> VerseRelationRepository => new EfRepository<VerseRelation>(this);

        #endregion

        #region IUnitOfWork

        public async Task<IList<T>> ToListAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default)
        {
            var result = await query.ToListAsync(cancellationToken);
            return result;
        }

        public IList<T> ToList<T>(IQueryable<T> query)
        {
            var result = query.ToList();
            return result;
        }

        public async Task<T> SingleAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default)
        {
            var result = await query.SingleAsync(cancellationToken);
            return result;
        }

        public T Single<T>(IQueryable<T> query)
        {
            var result = query.Single();
            return result;
        }

        public async Task<T> SingleOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default)
        {
            var result = await query.SingleOrDefaultAsync(cancellationToken);
            return result;
        }

        public T SingleOrDefault<T>(IQueryable<T> query)
        {
            var result = query.SingleOrDefault();
            return result;
        }

        public async Task<T> FirstAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default)
        {
            var result = await query.FirstAsync(cancellationToken);
            return result;
        }

        public T First<T>(IQueryable<T> query)
        {
            var result = query.First();
            return result;
        }

        public async Task<T> FirstOrDefaultAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default)
        {
            var result = await query.FirstOrDefaultAsync(cancellationToken);
            return result;
        }

        public T FirstOrDefault<T>(IQueryable<T> query)
        {
            var result = query.FirstOrDefault();
            return result;
        }

        public Task<bool> AnyAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default)
        {
            return query.AnyAsync(cancellationToken);
        }

        public bool Any<T>(IQueryable<T> query)
        {
            return query.Any();
        }

        public Task<int> CountAsync<T>(IQueryable<T> query, CancellationToken cancellationToken = default)
        {
            return query.CountAsync(cancellationToken);
        }

        public int Count<T>(IQueryable<T> query)
        {
            return query.Count();
        }

        public IQueryable<T> Include<T, TProperty>(
            IQueryable<T> query, Expression<Func<T, TProperty>> path, CancellationToken cancellationToken = default) where T : class
        {
            return query.Include(path);
        }

        #endregion

        #region Config

        private bool customConfiguration = false;
        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {            
            if (!customConfiguration)
            {
                optionsBuilder.UseSqlite("Data Source=BibleNote.Analytics.db");
            }
        }

        public AnalyticsContext(DbContextOptions<AnalyticsContext> options)
            : base (options)
        {
            this.customConfiguration = true;
        }

        public AnalyticsContext()            
        {            
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.ApplyConfigurationsFromAssembly(typeof(AnalyticsContext).Assembly);
        }

        #endregion
    }
}
