using AutoMapper;

namespace BibleNote.Infrastructure.AutoMapper
{
    public abstract class AutoMapperProfileBase : Profile
    {
        public AutoMapperProfileBase()
        {
            LoadStandardMappings();
            LoadCustomMappings();
        }

        private void LoadStandardMappings()
        {
            var mapsFrom = MapperProfileHelper.LoadStandardMappings(GetType().Assembly);

            foreach (var map in mapsFrom)
            {
                CreateMap(map.Source, map.Destination);
            }
        }

        private void LoadCustomMappings()
        {
            var mapsFrom = MapperProfileHelper.LoadCustomMappings(GetType().Assembly);

            foreach (var map in mapsFrom)
            {
                map.CreateMappings(this);
            }
        }
    }
}
