using BibleNote.Analytics.Data.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using BibleNote.Analytics.Persistence;
using System;

namespace BibleNote.Tests.Analytics.TestsBase
{
    public class DbTestsBase : TestsBase
    {
        protected IDbContext AnalyticsContext { get; set; }
        protected AnalyticsContext ConcreteContext { get; set; }

        private SqliteConnection connection;
        
        public override void Init(Action<IServiceCollection> registerServicesAction = null)
        {
            this.connection = new SqliteConnection(
                @"DataSource=..\..\..\..\Analytics\Persistence\BibleNote.Analytics.db"
                //"DataSource=:memory:"
                );
            connection.Open();

            base.Init(options =>
            {
                options.AddDbContext<IDbContext, AnalyticsContext>(opt => opt.UseSqlite(connection));
                registerServicesAction?.Invoke(options);
            });

            this.AnalyticsContext = ServiceProvider.GetService<IDbContext>();
            this.ConcreteContext = (AnalyticsContext)this.AnalyticsContext;
            this.ConcreteContext.Database.Migrate();            
            DbInitializer.Initialize(this.ConcreteContext);            
        }        
        
        public virtual void Cleanup()
        {
            this.connection?.Close();
        }
    }
}
