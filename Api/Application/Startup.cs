using BibleNote.Common.DiContainer;
using BibleNote.Providers.Html;
using BibleNote.Providers.OneNote;
using BibleNote.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace BibleNote.Application
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        public void ConfigureServices(IServiceCollection services)
        {
            services.AddControllersWithViews();

            services
                .AddApplicatonServices<ServicesModule>()
                .AddApplicatonServices<HtmlModule>()
                .AddApplicatonServices<OneNoteModule>();

            services.AddLogging();
            services.AddSwaggerDocument();
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Error");
            }

            app.UseStaticFiles();
            UseSwaggerSpecification(app);
            app.UseRouting();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllerRoute(
                    name: "default",
                    pattern: "{controller}/{action=Index}/{id?}");
            });
        }

        private static void UseSwaggerSpecification(IApplicationBuilder app)
        {
            const string specificationPath = "/api/specification.json";
            const string apiRoute = "/api";

            app.UseOpenApi(settings =>
            {
                settings.Path = specificationPath;
            });

            app.UseSwaggerUi(settings =>
            {
                settings.Path = apiRoute;
                settings.DocumentPath = specificationPath;
            });
        }
    }
}
