# encoding: utf-8
require 'inspec/fetcher'
require 'inspec/dependencies/dependency_set'
require 'digest'

module Inspec
  #
  # Inspec::Requirement represents a given profile dependency, where
  # appropriate we delegate to Inspec::Profile directly.
  #
  class Requirement
    attr_reader :name, :dep, :cwd, :opts
    attr_writer :dependencies

    def self.from_metadata(dep, vendor_index, opts)
      fail 'Cannot load empty dependency.' if dep.nil? || dep.empty?
      name = dep[:name] || fail('You must provide a name for all dependencies')
      version = dep[:version]
      new(name, version, vendor_index, opts[:cwd], opts.merge(dep))
    end

    def self.from_lock_entry(entry, cwd, vendor_index, backend)
      req = new(entry[:name],
                entry[:version_constraints],
                vendor_index,
                cwd,
                entry[:resolved_source].merge(backend: backend))

      locked_deps = []
      Array(entry['dependencies']).each do |dep_entry|
        locked_deps << Inspec::Requirement.from_lock_entry(dep_entry, cwd, vendor_index, backend)
      end
      req.lock_deps(locked_deps)
      req
    end

    def initialize(name, version_constraints, vendor_index, cwd, opts)
      @name = name
      @version_requirement = Gem::Requirement.new(Array(version_constraints))
      @dep = Gem::Dependency.new(name, @version_requirement, :runtime)
      @vendor_index = vendor_index
      @backend = opts[:backend]
      @opts = opts
      @cwd = cwd
    end

    def required_version
      @version_requirement
    end

    def source_version
      profile.metadata.params[:version]
    end

    def source_satisfies_spec?
      name = profile.metadata.params[:name]
      version = profile.metadata.params[:version]
      @dep.match?(name, version)
    end

    def resolved_source
      @resolved_source ||= fetcher.resolved_source
    end

    def to_hash
      h = {
        'name' => name,
        'resolved_source' => resolved_source,
        'version_constraints' => @version_requirement.to_s,
      }

      if !dependencies.empty?
        h['dependencies'] = dependencies.map(&:to_hash)
      end

      h['content_hash'] = content_hash if content_hash
      h
    end

    def lock_deps(dep_array)
      @dependencies = dep_array
    end

    def content_hash
      @content_hash ||= begin
                          archive_path = @vendor_index.archive_entry_for(fetcher.cache_key) || fetcher.archive_path
                          if archive_path && File.file?(archive_path)
                            Digest::SHA256.hexdigest File.read(archive_path)
                          end
                        end
    end

    def fetcher
      @fetcher ||= Inspec::Fetcher.resolve(opts)
      fail "No fetcher for #{name} (options: #{opts})" if @fetcher.nil?
      @fetcher
    end

    def dependencies
      @dependencies ||= profile.metadata.dependencies.map do |r|
        Inspec::Requirement.from_metadata(r, @vendor_index, cwd: @cwd, backend: @backend)
      end
    end

    def to_s
      "#{dep} (#{resolved_source})"
    end

    def profile
      opts = @opts.dup
      opts[:cache] = @vendor_index
      opts[:backend] = @backend
      if !@dependencies.nil?
        opts[:dependencies] = Inspec::DependencySet.from_array(@dependencies, @cwd, @vendor_index, @backend)
      end
      @profile ||= Inspec::Profile.for_target(opts, opts)
    end
  end
end
