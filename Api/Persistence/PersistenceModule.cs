using BibleNote.Common.DiContainer;
using BibleNote.Domain.Contracts;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Persistence
{
    public class PersistenceModule : ModuleBase
    {
        protected override void InitServices(IServiceCollection services)
        {
            services
              .AddDbContext<ITrackingDbContext, AnalyticsDbContext>()
              .AddDbContext<IReadOnlyDbContext, AnalyticsDbContext>()
                ;
        }
    }
}
